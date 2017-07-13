import Module from './module'
import {assert, forEachValue} from '../util'

export default class ModuleCollection {
    constructor(rawRootModule) {
        // register root module (Vuex.Store options)
        this.register([], rawRootModule, false)
    }

    /**
     * 根据传入的命名空间路径，
     * 从根模块层层获取下一级模块，知道获取到指定的模块
     * @param {*} path 
     */
    get(path) {
        return path.reduce((module, key) => {
            return module.getChild(key)
        }, this.root)
    }

    /**
     * 获取命名空间
     * @param {*} path 
     */
    getNamespace(path) {
        let module = this.root
        return path.reduce((namespace, key) => {
            module = module.getChild(key)
            return namespace + (module.namespaced
                ? key + '/'
                : '')
        }, '')
    }

    /**
     * 更新模块
     * @param {*} rawRootModule 
     */
    update(rawRootModule) {
        update([], this.root, rawRootModule)
    }

    /**
     * 注册模块
     * @param {*} path 
     * @param {*} rawModule 
     * @param {*} runtime 
     */
    register(path, rawModule, runtime = true) {
        /**
         * 注册时候，判断传进来的配置项是不是合法
         */
        if (process.env.NODE_ENV !== 'production') {
            assertRawModule(path, rawModule)
        }

        /**
         * 创建一个module
         */
        const newModule = new Module(rawModule, runtime)
        if (path.length === 0) {
            //如果path是一个空数组说明是根模块
            this.root = newModule
        } else {
            /**
             * 取当前模块的父模块
             */
            const parent = this.get(path.slice(0, -1))
            //把当前模块添加进模块的_children,传入当前模块名称，以及配置
            parent.addChild(path[path.length - 1], newModule)
        }

        /**
         * 如果当前模块有子模块，递归调用函数，注册子模块
         */
        // register nested modules
        if (rawModule.modules) {
            forEachValue(rawModule.modules, (rawChildModule, key) => {
                this.register(path.concat(key), rawChildModule, runtime)
            })
        }
    }

    /**
     * 卸载模块，
     * 传入模块路径
     * @param {*} path 
     */
    unregister(path) {
        /**
         * 获取父模块
         */
        const parent = this.get(path.slice(0, -1))
        //获取当前模块的名称
        const key = path[path.length - 1]
        //根据key值获取当前要卸载的模块
        if (!parent.getChild(key).runtime) 
            return

        //删除模块
        parent.removeChild(key)
    }
}


/**
 * 更新模块只能从根模块来更新
 * 一层层的递归来更新
 * @param {*} path 
 * @param {*} targetModule 
 * @param {*} newModule 
 */
function update(path, targetModule, newModule) {
    if (process.env.NODE_ENV !== 'production') {
        assertRawModule(path, newModule)
    }

    /**
     * 更新当前模块
     * update内部实现，只有在给相应的属性设置了新值
     * 才会去更新，没有设置的情况，不会去更新
     * update内部对于每一个要设置的属性都做了判断
     */
    // update target module
    targetModule.update(newModule)

    /**
     * 更新嵌套的模块
     */
    // update nested modules
    if (newModule.modules) {
        //遍历更新
        for (const key in newModule.modules) {
            //如果没有找到此模块，提示
            if (!targetModule.getChild(key)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(`[vuex] trying to add a new module '${key}' on hot reloading, ` + 'manual reload is needed')
                }
                return
            }
            //递归更新下一级模块
            update(path.concat(key), targetModule.getChild(key), newModule.modules[key])
        }
    }
}


/**
 * 判断当前有没有配置'getters', 'actions', 'mutations'
 * 如果配置了，判断是不是函数，如果不是函数就报错提示
 * @param {*} path 
 * @param {*} rawModule 
 */
function assertRawModule(path, rawModule) {
    ['getters', 'actions', 'mutations'].forEach(key => {
        if (!rawModule[key]) 
            return

        forEachValue(rawModule[key], (value, type) => {
            assert(typeof value === 'function', makeAssertionMessage(path, key, type, value))
        })
    })
}

function makeAssertionMessage(path, key, type, value) {
    let buf = `${key} should be function but "${key}.${type}"`
    if (path.length > 0) {
        buf += ` in module "${path.join('.')}"`
    }
    buf += ` is ${JSON.stringify(value)}.`

    return buf
}
