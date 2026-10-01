// Route preload hints (build only).
//
// The app is split into route chunks (Taxi shell, Food shell, the Food user router, the login screen, ...). The
// browser used to ask for them only AFTER the main bundle had downloaded, run and rendered the router, and each
// one then waited for the one before it (Food: shell -> user router -> pages): seconds of skeleton on a phone.
//
// At build time we know exactly which files each of those entry points needs. This plugin writes that table into
// index.html together with a few lines of script that, while the browser is still busy downloading the main
// bundle, starts fetching the files for the route being opened (and only for it). They are the very same URLs the
// app imports a moment later, so that import() simply finds them already downloaded.

const norm = (value) => String(value || '').replace(/\\/g, '/')

// key -> module files (path suffixes) whose static import tree should be fetched
const ENTRIES = {
  login: ['modules/auth/routes.jsx', 'modules/auth/pages/Login.jsx'],
  landing: ['modules/Landing/pages/PlatformLanding.jsx'],
  taxiUser: ['modules/Taxi/TaxiApp.jsx'],
  foodShell: ['modules/Food/routes.jsx'],
  foodUser: ['modules/Food/components/user/UserRouter.jsx'],
  foodRestaurant: ['modules/Food/components/restaurant/RestaurantRouter.jsx'],
  foodDelivery: ['modules/DeliveryV2/index.jsx'],
}

// Runs inside index.html before anything else. Keep in step with the routes in src/app/routes.jsx.
const buildRuntime = (manifest) => `(function () {
  try {
    var M = ${JSON.stringify(manifest)};
    var p = location.pathname || '/';
    var ls = window.localStorage;
    var keys = [];
    if (p === '/') {
      // a signed-in visitor is sent straight to Taxi; a guest sees the landing page
      keys = (ls.getItem('userToken') || ls.getItem('user_accessToken')) ? ['taxiUser'] : ['landing'];
    } else if (p === '/login' || p.indexOf('/login/') === 0) {
      keys = ['login'];
    } else if (p.indexOf('/taxi/user') === 0) {
      keys = ['taxiUser'];
    } else if (/^\\/food\\/restaurant(\\/|$)/.test(p)) {
      keys = ['foodShell', 'foodRestaurant'];
    } else if (/^\\/food\\/delivery(\\/|$)/.test(p)) {
      keys = ['foodShell', 'foodDelivery'];
    } else if (/^\\/food(\\/|$)/.test(p)) {
      keys = ['foodShell', 'foodUser'];
    }
    var head = document.head;
    keys.forEach(function (key) {
      var entry = M[key];
      if (!entry) return;
      (entry.js || []).forEach(function (href) {
        var link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = href;
        link.setAttribute('crossorigin', '');
        // low: the main bundle (already in flight) keeps the network first, these fill the gaps while it runs
        link.setAttribute('fetchpriority', 'low');
        head.appendChild(link);
      });
      (entry.css || []).forEach(function (href) {
        var link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'style';
        link.href = href;
        head.appendChild(link);
      });
    });
  } catch (e) { /* hints are an optimisation only */ }
})();`

export default function routePreloadHints() {
  let base = '/'

  return {
    name: 'route-preload-hints',
    apply: 'build',
    configResolved(config) {
      base = config.base || '/'
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return undefined

        const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
        const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))

        const staticTree = (startFile) => {
          const seen = new Set()
          const stack = [startFile]
          while (stack.length) {
            const file = stack.pop()
            if (seen.has(file)) continue
            const chunk = byFile.get(file)
            if (!chunk) continue
            seen.add(file)
            ;(chunk.imports || []).forEach((dep) => stack.push(dep))
          }
          return seen
        }

        // Vite already preloads the main bundle's own static imports - don't repeat them.
        const alreadyLoaded = ctx.chunk ? staticTree(ctx.chunk.fileName) : new Set()

        const manifest = {}
        for (const [key, suffixes] of Object.entries(ENTRIES)) {
          const js = new Set()
          const css = new Set()
          for (const suffix of suffixes) {
            const chunk = chunks.find(
              (item) => norm(item.facadeModuleId).endsWith(suffix) || Object.keys(item.modules || {}).some((id) => norm(id).endsWith(suffix)),
            )
            if (!chunk) continue
            for (const file of staticTree(chunk.fileName)) {
              if (alreadyLoaded.has(file)) continue
              js.add(file)
              byFile.get(file)?.viteMetadata?.importedCss?.forEach((cssFile) => css.add(cssFile))
            }
          }
          if (js.size > 0) {
            manifest[key] = { js: [...js].map((file) => `${base}${file}`), css: [...css].map((file) => `${base}${file}`) }
          }
        }

        if (Object.keys(manifest).length === 0) return undefined
        return [{ tag: 'script', children: buildRuntime(manifest), injectTo: 'head-prepend' }]
      },
    },
  }
}
