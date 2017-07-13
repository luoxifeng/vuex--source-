import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import {forEachValue, isObject, isPromise, assert} from './util'

let Vue // bind on install
/**
 * Store构造函数
 */
export class Store {

    //构造器函数
    constructor(options = {}) {
        //断言，一些正常实例化的判断
        if (process.env.NODE_ENV !== 'production') {
            /**
             * 因为此处的Vue是局部的，如果这里的Vue不存在的话
             * 说明并没有调用Vue.use(Vuex)，在实例化之前必须注册组件
             */
            assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)

            /**
             * 判断执行环境里面有没有Promise,因为Vuex内部实现需要Promise，
             * 如果原生不支持Promise,需要在使用的时候，加一个Promise的polyfill
             */
            assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)

            /**
             * 必须使用new关键字来实例化
             */
            assert(this instanceof Store, `Store must be called with the new operator.`)
        }

        //拿到配置对象上面的配置信息
        const {
            plugins = [],
            strict = false
        } = options

        let {
            state = {}
        } = options

        //判断如果state是函数的话，执行函数得到state对象
        if (typeof state === 'function') {
            state = state()
        }

        /**
         * 维护store内部的一些状态
         */
        // store internal state
        this._committing = false
        this._actions = Object.create(null)
        this._mutations = Object.create(null)
        this._wrappedGetters = Object.create(null)

        /**
         * 通过ModuleCollection，维护子模块
         */
        this._modules = new ModuleCollection(options)
        this._modulesNamespaceMap = Object.create(null)
        this._subscribers = []
        this._watcherVM = new Vue()

        /**
         * 绑定dispatch, commit到store实例上面
         * 其实内部最终调的还是原型上面的方法，只是在调用的时候，
         * 使用call的方式，让调用者变成当前store实例，
         * 在这里把方法绑到实例上的原因是因为
         * 在使用es6 class 关键字的时候，构造函数内部的方法
         * 其实不是在this上的，而是在实例的原型上面
         * 
         */
        // bind commit and dispatch to self
        const store = this
        const {dispatch, commit} = this
        this.dispatch = function boundDispatch(type, payload) {
            return dispatch.call(store, type, payload)
        }
        this.commit = function boundCommit(type, payload, options) {
            return commit.call(store, type, payload, options)
        }

        // strict mode
        this.strict = strict

        /**
         * 在这里初始化根模块，以及递归的注册所有的子模块
         * 同时收集所有模块的getter放到实例的_wrappedGetters里面
         */
        // init root module. this also recursively registers all sub-modules and
        // collects all module getters inside this._wrappedGetters
        installModule(this, state, [], this._modules.root)

        /**
         * 初始化store,使其变成响应式的，
         * 同事处理所有的_wrappedGetters作为计算属性
         */
        // initialize the store vm, which is responsible for the reactivity (also
        // registers _wrappedGetters as computed properties)
        resetStoreVM(this, state)

        /**
         * 把Vuex提供的内置插件，以及配置的插件放到一起
         * 一次执行，传入当前的store实例
         */
        // apply plugins
        plugins.concat(devtoolPlugin).forEach(plugin => plugin(this))
    }

    /**
     * 为了实现响应式，store实例上面新建了一个Vue实例，
     * $$state 就是我们配置的state
     */
    get state() {
        return this._vm._data.$$state
    }

    /**
     * Vuex只允许显示的调用方法来改变state,
     * 在我们使用的过程中，如果没有显示的调用方法而改变state
     * 会报错提示，让我们调用方法来改变state,
     * 这样做的原因是因为，因为store是一个单例的，
     * 我们在许多地方用到它，而直接通过赋值的形式改变state,
     * 会让其变得不可追踪
     */
    set state(v) {
        if (process.env.NODE_ENV !== 'production') {
            assert(false, `Use store.replaceState() to explicit replace store state.`)
        }
    }

    /**
     * 提交改变state
     * @param {*} _type 
     * @param {*} _payload 
     * @param {*} _options 
     */
    commit(_type, _payload, _options) {
        // check object-style commit
        const {type, payload, options} = unifyObjectStyle(_type, _payload, _options)

        const mutation = {
            type,
            payload
        }
        const entry = this._mutations[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown mutation type: ${type}`)
            }
            return
        }
        this._withCommit(() => {
            entry
                .forEach(function commitIterator(handler) {
                    handler(payload)
                })
        })
        this._subscribers
            .forEach(sub => sub(mutation, this.state))

        if (process.env.NODE_ENV !== 'production' && options && options.silent) {
            console.warn(`[vuex] mutation type: ${type}. Silent option has been removed. ` + 'Use the filter functionality in the vue-devtools')
        }
    }

    /**
     * 分发dispatch
     * @param {*} _type 
     * @param {*} _payload 
     */
    dispatch(_type, _payload) {
        // check object-style dispatch
        const {type, payload} = unifyObjectStyle(_type, _payload)

        const entry = this._actions[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown action type: ${type}`)
            }
            return
        }
        return entry.length > 1
            ? Promise.all(entry.map(handler => handler(payload)))
            : entry[0](payload)
    }

    /**
     * 添加订阅
     * @param {*} fn 
     */
    subscribe(fn) {
        const subs = this._subscribers
        /**
         * 如果之前么有添加过，就添加进订阅队列
         */
        if (subs.indexOf(fn) < 0) {
            subs.push(fn)
        }
        /**
         * 返回一个函数
         */
        return () => {
            const i = subs.indexOf(fn)
            if (i > -1) {
                subs.splice(i, 1)
            }
        }
    }

    /**
     * 监听store的getter
     * @param {*} getter 
     * @param {*} cb 
     * @param {*} options 
     */
    watch(getter, cb, options) {
        if (process.env.NODE_ENV !== 'production') {
            assert(typeof getter === 'function', `store.watch only accepts a function.`)
        }
        return this
            ._watcherVM
            .$watch(() => getter(this.state, this.getters), cb, options)
    }

    /**
     * 显式的改变state
     * @param {*} state 
     */
    replaceState(state) {
        this._withCommit(() => {
            this._vm._data.$$state = state
        })
    }

    /**
     * 动态注册模块，
     * 只能注册子模块
     * @param {*} path 
     * @param {*} rawModule 
     */
    registerModule(path, rawModule) {
        //把path包装成数组
        if (typeof path === 'string') 
            path = [path]

        if (process.env.NODE_ENV !== 'production') {
            /**
             * 只能传一个数组和字符串
             */
            assert(Array.isArray(path), `module path must be a string or an Array.`)
            /**
             * 如果路径不存在，代表我们要注册根模块，
             * 但是vuex是不允许我们注册跟模块的
             */
            assert(path.length > 0, 'cannot register the root module by using registerModule.')
        }

        /**
         * 注册子模块，传入路径和配置
         */
        this._modules.register(path, rawModule)

        //安装模块
        installModule(this, this.state, path, this._modules.get(path))

        /**
         * 更新Vm
         */
        // reset store to update getters...
        resetStoreVM(this, this.state)
    }

    /**
     * 卸载模块
     * @param {*} path 
     */
    unregisterModule(path) {
        if (typeof path === 'string') 
            path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
        }

        this
            ._modules
            .unregister(path)
        this._withCommit(() => {
            const parentState = getNestedState(this.state, path.slice(0, -1))
            Vue.delete(parentState, path[path.length - 1])
        })
        resetStore(this)
    }

    /**
     * 热更新
     * @param {*} newOptions 
     */
    hotUpdate(newOptions) {
        this
            ._modules
            .update(newOptions)
        resetStore(this, true)
    }

    /**
     * 包装执行函数
     * 先把_committing缓存下来，然后把其变为true
     * 代表当前有commit正在提交中，当函数执行结束以后
     * 在还原之前的状态
     * @param {*} fn 
     */
    _withCommit(fn) {
        const committing = this._committing
        this._committing = true
        fn()
        this._committing = committing
    }
}

/**
 * 重置store
 * @param {*} store 
 * @param {*} hot 
 */
function resetStore(store, hot) {
    store._actions = Object.create(null)
    store._mutations = Object.create(null)
    store._wrappedGetters = Object.create(null)
    store._modulesNamespaceMap = Object.create(null)
    const state = store.state
    // init all modules
    installModule(store, state, [], store._modules.root, true)
    // reset vm
    resetStoreVM(store, state, hot)
}

/**
 * 重置store vm
 * @param {*} store 
 * @param {*} state 
 * @param {*} hot 
 */
function resetStoreVM(store, state, hot) {
    //缓存老的_vm
    const oldVm = store._vm

    /**
     * 绑定公共的getters
     */
    // bind store public getters
    store.getters = {}
    const wrappedGetters = store._wrappedGetters
    const computed = {}
    /**
     * 遍历之前的getters,重新设置store.getters
     */
    forEachValue(wrappedGetters, (fn, key) => {
        // use computed to leverage its lazy-caching mechanism
        computed[key] = () => fn(store)
        Object.defineProperty(store.getters, key, {
            get: () => store._vm[key],
            enumerable: true // for local getters
        })
    })

    /**
     * 使用一个Vue实例来存储store树结构，为了抑制用户添加一些全局的mixins
     */
    // use a Vue instance to store the state tree suppress warnings just in case the
    // user has added some funky global mixins
    const silent = Vue.config.silent
    Vue.config.silent = true
    store._vm = new Vue({
        data: {
            $$state: state
        },
        computed
    })
    Vue.config.silent = silent

    // enable strict mode for new vm
    if (store.strict) {
        enableStrictMode(store)
    }

    /**
     * 如果老的vm存在就销毁
     * 
     */
    if (oldVm) {
        if (hot) {
            /**
             * 如果配置热更新，就强制重新计算所有的getter
             */
            // dispatch changes in all subscribed watchers to force getter re-evaluation for
            // hot reloading.
            store._withCommit(() => {
                oldVm._data.$$state = null
            })
        }
        //销毁之前的vm
        Vue.nextTick(() => oldVm.$destroy())
    }
}

/**
 * 安装模块
 * @param {*} store 
 * @param {*} rootState 
 * @param {*} path 
 * @param {*} module 
 * @param {*} hot 
 */
function installModule(store, rootState, path, module, hot) {
    //如果path长度是0，说明是根store模块
    const isRoot = !path.length
    //获取命名空间
    const namespace = store._modules.getNamespace(path)

    /**
     * 只有在配置了namespaced属性的模块，才会映射到store实例_modulesNamespaceMap属性上
     * 维护一个使用了命名空间的模块的集合
     */
    // register in namespace map
    if (module.namespaced) {
        store._modulesNamespaceMap[namespace] = module
    }

    /**
     * 把子模块的state设置到父模块的state上面
     */
    // set state
    if (!isRoot && !hot) {
        const parentState = getNestedState(rootState, path.slice(0, -1))
        const moduleName = path[path.length - 1]
        store._withCommit(() => {
            Vue.set(parentState, moduleName, module.state)
        })
    }

    /**
     * 
     */
    const local = module.context = makeLocalContext(store, namespace, path)

    module.forEachMutation((mutation, key) => {
        const namespacedType = namespace + key
        registerMutation(store, namespacedType, mutation, local)
    })

    module.forEachAction((action, key) => {
        const namespacedType = namespace + key
        registerAction(store, namespacedType, action, local)
    })

    module.forEachGetter((getter, key) => {
        const namespacedType = namespace + key
        registerGetter(store, namespacedType, getter, local)
    })

    /**
     * 递归安装模块
     */
    module.forEachChild((child, key) => {
        installModule(store, rootState, path.concat(key), child, hot)
    })
}


/**
 * 造一个本地化的上下文
 */
/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext(store, namespace, path) {
    const noNamespace = namespace === ''
    /**
     * 如果我们没有配置使用命名空间，那么我们在不同层级配置的所有同名的action和mutation
     * 会被推到store实例上面的_actions或者_mutations的相应key值所对应的队列里面，
     * 就是说我们配置的所有的同名的action或者mutation会在一个数组里面，
     * 当我们调用commit或者dispatch时候，会一次执行数组里面的方法
     * 
     * 当我们配置使用命名空间的时候，在_action或者_mutations里面会保存带命名空间的key,
     * 在我们调用时，会自动加上命名空间
     */
    const local = {
      
        dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options)
            const {payload, options} = args
            let {type} = args

            if (!options || !options.root) {
                type = namespace + type
                if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
                    console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
                    return
                }
            }

            return store.dispatch(type, payload)
        },

        commit: noNamespace? store.commit: (_type, _payload, _options) => {
                const args = unifyObjectStyle(_type, _payload, _options)
                const {payload, options} = args
                let {type} = args

                if (!options || !options.root) {
                    type = namespace + type
                    if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
                        console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
                        return
                    }
                }

                store.commit(type, payload, options)
            }
    }

    // getters and state object must be gotten lazily because they will be changed
    // by vm update
    Object.defineProperties(local, {
        getters: {
            get: noNamespace? () => store.getters: () => makeLocalGetters(store, namespace)
        },
        state: {
            get: () => getNestedState(store.state, path)
        }
    })

    return local
}

function makeLocalGetters(store, namespace) {
    const gettersProxy = {}

    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
            // skip if the target getter is not match this namespace
            if (type.slice(0, splitPos) !== namespace) 
                return

                // extract local getter type
            const localType = type.slice(splitPos)

            // Add a port to the getters proxy. Define as getter property because we do not
            // want to evaluate the getters in this time.
            Object.defineProperty(gettersProxy, localType, {
                get: () => store.getters[type],
                enumerable: true
            })
        })

    return gettersProxy
}

/**
 * 在store._mutations 注册
 * @param {*} store 
 * @param {*} type 
 * @param {*} handler 
 * @param {*} local 
 */
function registerMutation(store, type, handler, local) {
    /**
     * store._mutations，是一个数组维护所有模块的mutations
     * 
     */
    
    const entry = store._mutations[type] || (store._mutations[type] = [])

    /**
     * 我们commit的时候，
     */
    entry.push(function wrappedMutationHandler(payload) {
        handler(local.state, payload)
    })
}

function registerAction(store, type, handler, local) {
    const entry = store._actions[type] || (store._actions[type] = [])
    entry.push(function wrappedActionHandler(payload, cb) {
        let res = handler({
            dispatch: local.dispatch,
            commit: local.commit,
            getters: local.getters,
            state: local.state,
            rootGetters: store.getters,
            rootState: store.state
        }, payload, cb)
        if (!isPromise(res)) {
            res = Promise.resolve(res)
        }
        if (store._devtoolHook) {
            return res.catch(err => {
                store
                    ._devtoolHook
                    .emit('vuex:error', err)
                throw err
            })
        } else {
            return res
        }
    })
}

function registerGetter(store, type, rawGetter, local) {
    if (store._wrappedGetters[type]) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[vuex] duplicate getter key: ${type}`)
        }
        return
    }
    store._wrappedGetters[type] = function wrappedGetter(store) {
        return rawGetter(local.state, // local state
                local.getters, // local getters
                store.state, // root state
                store.getters // root getters
        )
    }
}

function enableStrictMode(store) {
    store._vm
        .$watch(function () {
            return this._data.$$state
        }, () => {
            if (process.env.NODE_ENV !== 'production') {
                assert(store._committing, `Do not mutate vuex store state outside mutation handlers.`)
            }
        }, {
            deep: true,
            sync: true
        })
}

function getNestedState(state, path) {
    return path.length ? path.reduce((state, key) => state[key], state) : state
}

/**
 * 处理传对象的形式
 * @param {*} type 
 * @param {*} payload 
 * @param {*} options 
 */
function unifyObjectStyle(type, payload, options) {
    if (isObject(type) && type.type) {
        options = payload
        payload = type
        type = type.type
    }

    if (process.env.NODE_ENV !== 'production') {
        assert(typeof type === 'string', `Expects string as the type, but found ${typeof type}.`)
    }

    return {type, payload, options}
}

/**
 * 组件的install方法，这个方法是安装组件的方法
 * 对外暴露
 * @param {*} _Vue
 */
export function install(_Vue) {
    /**
     * 因为Vue在调用组件的install时候，会注入Vue
     * 此方法使用_Vue来接收，然后赋值给此闭包内部一个变量Vue，
     * 一旦组件被注册过一次以后，Vue就有了值，下次再进行注册组件的时候
     * 就会报错，为了避免重复注册组件
     */
    //组件注册过一次以后，Vue就有了值，避免重复注册组件
    if (Vue) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[vuex] already installed. Vue.use(Vuex) should be called only once.')
        }
        return
    }
    //第一次注册组件，把构造函数赋值给闭包内部的Vue
    Vue = _Vue

    /**
     * 调用applyMixin，来注册组件的一些东西
     * 此方法在mixin.js文件里面
     */
    applyMixin(Vue)
}

/**
 * vuex 自动安装，判断如果全局暴露了Vue构造函数，
 * 就自动执行install方法，自动安装vuex
 */
// auto install in dist mode
if (typeof window !== 'undefined' && window.Vue) {
    install(window.Vue)
}
