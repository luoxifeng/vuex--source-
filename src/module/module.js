import {forEachValue} from '../util'
/**
 * 模块构造函数
 */
export default class Module {
    constructor(rawModule, runtime) {
        this.runtime = runtime
        this._children = Object.create(null)
        //模块的配置
        this._rawModule = rawModule

        //模块的state
        const rawState = rawModule.state
        this.state = (typeof rawState === 'function'
            ? rawState()
            : rawState) || {}
    }

    get namespaced() {
        return !!this._rawModule.namespaced
    }

    /**
     * 添加子模块
     * @param {*} key 
     * @param {*} module 
     */
    addChild(key, module) {
        this._children[key] = module
    }

    /**
     * 删除子模块
     * @param {*} key 
     */
    removeChild(key) {
        delete this._children[key]
    }

    /**
     * 获取子模块
     * @param {*} key 
     */
    getChild(key) {
        return this._children[key]
    }

    /**
     * 更新子模块
     * @param {*} rawModule 
     */
    update(rawModule) {
        //重新设置子模块的一些设置
        this._rawModule.namespaced = rawModule.namespaced
        if (rawModule.actions) {
            this._rawModule.actions = rawModule.actions
        }
        if (rawModule.mutations) {
            this._rawModule.mutations = rawModule.mutations
        }
        if (rawModule.getters) {
            this._rawModule.getters = rawModule.getters
        }
    }

    /**
     * 遍历每个子模块
     * @param {*} fn 
     */
    forEachChild(fn) {
        forEachValue(this._children, fn)
    }

    /**
     * 遍历每个getter
     * @param {*} fn 
     */
    forEachGetter(fn) {
        //如果配置存在
        if (this._rawModule.getters) {
            forEachValue(this._rawModule.getters, fn)
        }
    }

    /**
     * 遍历每个action
     * @param {*} fn 
     */
    forEachAction(fn) {
        if (this._rawModule.actions) {
            forEachValue(this._rawModule.actions, fn)
        }
    }

    /**
     * 遍历每个mutation
     * @param {*} fn 
     */
    forEachMutation(fn) {
        if (this._rawModule.mutations) {
            forEachValue(this._rawModule.mutations, fn)
        }
    }
}
