let inspireComponentPrefix = 'app'
let providerCache = new Map()

class Component extends HTMLElement {

    constructor() {
        super()

        this.attachShadow({ mode: 'open' })
        this.shadowRoot.innerHTML = this.render()

        this.eventListeners = new Map()

        this.injectDependencies();
        this.setUpBindings();

        this.autoWatch()
    }

    setUpBindings() {
        const bindings = this.constructor.bindings
        if (!(bindings instanceof Object)) { return }

        for (const [name, paramConfig] of Object.entries(bindings)) {
            let config = {search: null, multi: false, events: {}}

            if (Array.isArray(paramConfig)) {
                const [search, property] = paramConfig
                Object.assign(config, { search, property })
            } else if (paramConfig instanceof Object && Reflect.has(paramConfig, 'search')) {
                Object.assign(config, paramConfig)
            } else {
                Object.assign(config, { search: paramConfig })
            }

            if (config.search instanceof Function) { config.search = selectorOf(config.search) }

            const binding = config.multi ?
                this.shadowRoot.querySelectorAll(config.search) :
                this.shadowRoot.querySelector(config.search)

            for (const [name, handler] of Object.entries(config.events)) {
                this.eventListeners.set(config.search, { name, handler })
            }

            if (Reflect.has(config, 'property')) {
                const property = Reflect.get(config, 'property')

                Reflect.defineProperty(this, name, {
                    configurable: true,
                    enumerable: true,
                    get: () => { return Reflect.get(binding, property) },
                    set: (value) => { Reflect.set(binding, property, value) }
                })
            } else {
                Reflect.set(this, name, binding)
            }
        }
    }

    injectDependencies() {
        const dependencies = this.constructor.providers
        if (Array.isArray(dependencies)) {
            this.inject(...dependencies.map((provider) => instantiate(provider)))
        }
    }

    render() { throw new Error('Method is not implemented!') }

    inject() { }

    emit(name, data) {
        this.dispatchEvent(new CustomEvent(name, { detail: data }))
    }

    watch(target, name, handler) {
        target.addEventListener(name, (...args) => Reflect.apply(handler, this, args))
    }

    autoWatch() {
        this.eventListeners.forEach(({ name, handler }, selector) => {
            const elements = this.shadowRoot.querySelectorAll(selector);
            elements.forEach((element) => this.watch(element, name, handler))
        })
    }
}

class Service {
    inject() { }
}

const bootstrap = (() => {

    let componentSet = new Set()

    function bootstrap(rootComponentType, prefix = 'app') {
        inspireComponentPrefix = prefix

        registerComponent(rootComponentType)
    }

    function registerComponent(componentType) {
        if (componentSet.has(componentType)) { return }

        if (!Reflect.has(componentType, 'selector')) {
            throw new Error(`Component "${componentType.name}" does not provide a selector!`)
        }

        customElements.define(`${inspireComponentPrefix}-${componentType.selector}`, componentType)
        componentSet.add(componentType)

        const childComponentTypes = componentType.components

        if (!Array.isArray(childComponentTypes)) { return }

        for (const childComponentType of childComponentTypes) {
            registerComponent(childComponentType)
        }
    }

    return bootstrap
})()

const selectorOf = (componentType) => {
    return `${inspireComponentPrefix}-${componentType.selector}`
}

const instantiate = (providerType) => {
    if (providerCache.has(providerType)) { return providerCache.get(providerType) }

    const dependencies = providerType.providers
    const instance = Reflect.construct(providerType, [])

    if (Array.isArray(dependencies) && dependencies.length !== 0) {
        instance.inject(...dependencies.map((provider) => instantiate(provider)))
    }

    return instance
}
