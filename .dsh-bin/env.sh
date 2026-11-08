# Local launch environment for this checkout (sandbox: keep all writes in-repo).
export DSH_REPO="/Users/yilukaige/deepseek-harness-master"
# Node 24.18.0 from /usr/local carries development headers that the native addon build needs.
export DSH_NODE_BIN="/usr/local/bin"
export DSH_NODE="$DSH_NODE_BIN/node"
export DSH_PNPM_JS="/Users/yilukaige/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs"
export PATH="$DSH_REPO/.dsh-bin:$DSH_NODE_BIN:$PATH"
export npm_config_store_dir="$DSH_REPO/.pnpm-store"
export npm_config_cache_dir="$DSH_REPO/.pnpm-cache"
export npm_config_state_dir="$DSH_REPO/.pnpm-state"
export npm_config_devdir="$DSH_REPO/.pnpm-cache/node-gyp"
export npm_config_registry="https://registry.npmmirror.com/"
# Native addons (koffi) link N-API symbols dynamically on macOS.
export LDFLAGS="-undefined dynamic_lookup"
# No Git metadata in this checkout; keep the build's client environment resolvable.
export DSH_CLIENT_COMMIT_HASH="0000000"
