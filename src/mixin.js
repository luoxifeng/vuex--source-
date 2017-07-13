/**
 * 此方法在store.js里面被调用
 * 方法名：applyMixin
 * @param {*} Vue
 */

//暴露出去的方法
export default function (Vue) {
    /**
   * 判断Vue的版本，因为Vue2.0以上的生命周期函数名称变了
   * 为了兼容，所以做了相应的处理
   */
    const version = Number(Vue.version.split('.')[0])

    if (version >= 2) {
        /**
         * 在beforeCreate钩子函数里面执行vuexInit
         * 原理是：通过Vue.mixin混入的生命周期函数，在实例化的过程中会被调用，
         * Vue.mixin可以混入同名的钩子函数，这些函数会被推入一个队列，
         * 依次被执行
         */
        Vue.mixin({beforeCreate: vuexInit})
    } else {
        /**
         * 重写Vue的init方法，然后注入vuex的init过程，
         * 为了向前兼容低版本的
         */
        // override init and inject vuex init procedure for 1.x backwards compatibility.
        /**
         * 拿到Vue原始的init方法，使用一个变量保存下来
         * 然后重写Vue._init方法
         */
        const _init = Vue.prototype._init
        Vue.prototype._init = function (options = {}) {
            /**
             * 判断配置有没有init钩子函数，有的话把vuexinit加进去，没有就直接是vuexInit
             * 然后执行原始的Vue._init函数，把扩展好的配置传进去
             */
            options.init = options.init
                ? [vuexInit].concat(options.init)
                : vuexInit
            _init.call(this, options)
        }
    }

    /**
   * Vuex init hook, injected into each instances init hooks list.
   */
    /**
     * Vuex，init钩子函数，注入到每一个实例的init队列里面每一个
     */

    function vuexInit() {
        //拿到每个实例的配置信息
        const options = this.$options

        /**
         * 把$store挂载到每一个实例上面
         */
        // store injection
        //如果当前组件配置了store
        if (options.store) {
            /**
             * 如果store是函数 ，就执行函数，得到结果放到实例的$store上面
             * 否则直接挂载
             */
            this.$store = typeof options.store === 'function'
                ? options.store()
                : options.store
        } else if (options.parent && options.parent.$store) {
            /**
             * 当前没有组件没有配置store就向上查找，按照这种方式，
             * 如果当前组件没有配置store的话，在实例化每个组件的时候，
             * 都会从父级组件上找$store,那么如果在根组件上注册￥store的话，
             * 组件在实例化的过程中，$store会层层的挂载到每一个组件身上，
             * 这样做的目的是为了，当组件嵌套层级比较多的情况下，可以很快的使用到$store,
             * 同时因为store是单例的，没必要层层读取注册，这就是我们一般只在根组件上面，
             * 注册store的原因，通过这段代码可以实现所有组件公用一个store实例，
             * 同时又避免了在每个组件上都注册的麻烦
             */
            this.$store = options.parent.$store
        }
    }
}
