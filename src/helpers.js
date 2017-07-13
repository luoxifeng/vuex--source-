/**
 * 快捷取到state以及getters的工具方法
 */

/**
 * 映射state
 */
export const mapState = normalizeNamespace((namespace, states) => {
    const res = {}
    /**
     * 遍历所有映射的state
     */
    normalizeMap(states).forEach(({key, val}) => {
        /**
         * 把在store配置的state包装成函数，此函数相当于组件的computed,
         * 我们知道组件的每一个computed,都是一个getter,
         * 并且getter的调用者是当前组件实例，就是此函数内部的this,
         * 所以我们通过this.$sotre可以拿到store实例，
         */
        res[key] = function mappedState() {
            /**
             * 拿到根store上面的state和getters
             */
            let state = this.$store.state
            let getters = this.$store.getters
            /**
             * 如果有命名空间，我们取模块store的state，getters
             */
            if (namespace) {
                //取子模块,没有此子模块就不继续执行
                const module = getModuleByNamespace(this.$store, 'mapState', namespace)
                if (!module) {
                    return
                }
                state = module.context.state
                getters = module.context.getters
            }

            //如果是函数就执行函数，不是的话直接返回值
            return typeof val === 'function'
                ? val.call(this, state, getters)
                : state[val]
        }
        // mark vuex getter for devtools
        res[key].vuex = true
    })
    return res
})

/**
 * 映射mutations
 */
export const mapMutations = normalizeNamespace((namespace, mutations) => {
    const res = {}
    normalizeMap(mutations).forEach(({key, val}) => {
        val = namespace + val
        res[key] = function mappedMutation(...args) {
            if (namespace && !getModuleByNamespace(this.$store, 'mapMutations', namespace)) {
                return
            }
            return this
                .$store
                .commit
                .apply(this.$store, [val].concat(args))
        }
    })
    return res
})

/**
 * 映射getters
 */
export const mapGetters = normalizeNamespace((namespace, getters) => {
    const res = {}
    normalizeMap(getters).forEach(({key, val}) => {
        val = namespace + val
        res[key] = function mappedGetter() {
            if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
                return
            }
            if (process.env.NODE_ENV !== 'production' && !(val in this.$store.getters)) {
                console.error(`[vuex] unknown getter: ${val}`)
                return
            }
            return this.$store.getters[val]
        }
        // mark vuex getter for devtools
        res[key].vuex = true
    })
    return res
})

export const mapActions = normalizeNamespace((namespace, actions) => {
    const res = {}
    normalizeMap(actions).forEach(({key, val}) => {
        val = namespace + val
        res[key] = function mappedAction(...args) {
            if (namespace && !getModuleByNamespace(this.$store, 'mapActions', namespace)) {
                return
            }
            return this
                .$store
                .dispatch
                .apply(this.$store, [val].concat(args))
        }
    })
    return res
})

export const createNamespacedHelpers = (namespace) => ({
    mapState: mapState.bind(null, namespace),
    mapGetters: mapGetters.bind(null, namespace),
    mapMutations: mapMutations.bind(null, namespace),
    mapActions: mapActions.bind(null, namespace)
})

/**
 * 处理映射关系，兼容数组和对象
 * 把对象和数组处理成一个对象数组，
 * 数组的每一项都是一个
 * {
 *      key: 'xxx',//state的名称
 *      val: function|string //
 * }
 * 处理好交给后=续的函数处理
 * @param {*} map 
 */
function normalizeMap(map) {
    /**
     * 如果map是数组，那么必须是一个字符串数组
     */
    return Array.isArray(map)
        ? map.map(key => ({key, val: key}))
        : Object
            .keys(map)
            .map(key => ({key, val: map[key]}))
}


/**
 * 公共方法
 * 作用是同时支持取根模块或者子模块的state或者getters，
 * 取子模块的时候，需要加命名空间
 * @param {*} fn 
 */
function normalizeNamespace(fn) {
    /**
     * 如果在使用的时候，第一个参数不是字符串，说明要取的是根store的state,
     * 那么把传进来的参数赋值给map,
     * 如果传进来的第一个参数带命名空间，说明要取的就是模块的state,
     * 为了兼容命名空间写的不规范，这里做了判断，会在最后加上‘/’
     * 最后执行函数
     */
    return (namespace, map) => {
        if (typeof namespace !== 'string') {
            map = namespace
            namespace = ''
        } else if (namespace.charAt(namespace.length - 1) !== '/') {
            namespace += '/'
        }
        return fn(namespace, map)
    }
}

/**
 * 取子模块
 * @param {*} store 
 * @param {*} helper 
 * @param {*} namespace 
 */
function getModuleByNamespace(store, helper, namespace) {
    //在组件上的$store上面根据命名空间取子模块的store
    const module = store._modulesNamespaceMap[namespace]
    if (process.env.NODE_ENV !== 'production' && !module) {
        console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`)
    }
    return module
}
