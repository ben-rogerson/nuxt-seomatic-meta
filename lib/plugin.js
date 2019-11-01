const consola = require('consola')

export default ({ app }) => {
  app.seomaticMeta = async function nuxtSeomaticMeta({ fullPath }) {
    const options = <%= serialize(options) %>

    // Custom remapping of routes to other routes
    // This is so you can grab seomatic data from another page
    // Eg: Your nuxt homepage has a slug of '/' but you want data
    // from a page in Craft with a slug of 'homepage'
    let routeRemapPath
    if (
      typeof options.routeRemap === 'object' &&
      options.routeRemap
    ) {
      const foundRouteRemap = options.routeRemap.find(
        ({ path }) => path === fullPath,
      )
      routeRemapPath = foundRouteRemap && foundRouteRemap.getFrom
      if (options.debug && routeRemapPath) {
        consola.info(
          `Getting metadata for '${fullPath}' from '${routeRemapPath}'`,
        )
      }
    }

    // Determine route name to use in graphql query
    const routeName = routeRemapPath || fullPath

    // Retrieve the seomatic graphql data via Axios
    if (app.$axios === undefined) {
      return consola.error(`SeomaticMeta plugin: Axios not found, add it to your module array like this:\n\nmodules: ['nuxt-seomatic-meta', '@nuxtjs/axios'],`)
    }

    if (!options.backendUrl) {
      return consola.error(`SeomaticMeta plugin: No backendUrl specified`)
    }

    if (!options.graphqlPath) {
      return consola.error(`SeomaticMeta plugin: No graphqlPath specified`)
    }

    const { data } = await app.$axios.post(
      options.backendUrl + options.graphqlPath,
      {
        query: `
          {
            seomatic(uri:"${routeName}", asArray: true) {
              metaTitleContainer
              metaTagContainer
              metaLinkContainer
              metaScriptContainer
              metaJsonLdContainer
            }
          }
      `,
      },
      {
        headers: {
            ...options.graphqlToken && {Authorization: `Bearer ${options.graphqlToken}`},
        },
      },
    ).catch(error => String(error).includes(`failed with status code 403`) ? consola.error(new Error(`SeomaticMeta plugin: Can't connect to Crafts graphQl api, try adjusting the credentials:\n\nbackendUrl: '${options.backendUrl}'\ngraphqlPath: '${options.graphqlPath}'\ngraphqlToken: '${options.graphqlToken}'`)) : '')

    if (!data) consola.error(new Error(`No data was returned from Craft`))

    if (options.debug) consola.info('Received GraphQl data', data)

    // Convert the graphql JSON data to an object so we can work with it
    const {
      metaTitleContainer: {
        title: { title },
      },
      metaTagContainer,
      metaLinkContainer,
      metaScriptContainer,
      metaJsonLdContainer,
    } = Object.entries(data.data.seomatic).reduce(
      (acc, [key, value]) => {
        acc[key] = JSON.parse(value)
        return acc
      },
      {},
    )

    // Flatten metaTagContainer values into string
    const meta = metaTagContainer
      ? Object.values(metaTagContainer).reduce(
          (flat, next) => flat.concat(next),
          [],
        )
      : null

    // Flatten metaLinkContainer values into string
    const link = metaLinkContainer
      ? Object.values(metaLinkContainer).reduce(
          (flat, next) => flat.concat(next),
          [],
        )
      : null

    // Convert script data to <script>..</script>
    const metaScripts = metaScriptContainer
      ? Object.values(metaScriptContainer).map(({ script }) => ({
          innerHTML: script,
        }))
      : []

    // Convert JsonLd to <script type="application/ld+json">...</script>
    const jsonLd = metaJsonLdContainer
      ? Object.entries(metaJsonLdContainer).map(value => ({
          type: 'application/ld+json',
          innerHTML: JSON.stringify(value),
        }))
      : []

    // Combine processed script data
    const script = [...metaScripts, ...jsonLd]

    return {
      ...(title && { title }),
      ...(meta && { meta }),
      ...(link && { link }),
      script,
      __dangerouslyDisableSanitizers: ['script'],
    }
  }
}
