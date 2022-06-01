import { svelte } from '@sveltejs/vite-plugin-svelte';
import * as vite from 'vite';
import { get_aliases } from '../utils.js';

/**
 * @typedef {import('rollup').RollupOutput} RollupOutput
 * @typedef {import('rollup').OutputChunk} OutputChunk
 * @typedef {import('rollup').OutputAsset} OutputAsset
 */

/** @param {import('vite').UserConfig} config */
export async function create_build(config) {
	const { output } = /** @type {RollupOutput} */ (await vite.build(config));

	const chunks = output.filter(
		/** @returns {output is OutputChunk} */ (output) => output.type === 'chunk'
	);

	const assets = output.filter(
		/** @returns {output is OutputAsset} */ (output) => output.type === 'asset'
	);

	return { chunks, assets };
}

/**
 * @param {string} file
 * @param {import('vite').Manifest} manifest
 * @param {Set<string>} css
 * @param {Set<string>} js
 * @param {boolean} dynamic
 */
export function find_deps(file, manifest, js, css, dynamic) {
	const chunk = manifest[file];

	if (js.has(chunk.file)) return;
	if (!dynamic) js.add(chunk.file);

	if (chunk.css) {
		chunk.css.forEach((file) => css.add(file));
	}

	if (chunk.imports) {
		chunk.imports.forEach((file) => find_deps(file, manifest, js, css, dynamic));
	}

	if (chunk.dynamicImports) {
		chunk.dynamicImports.forEach((file) => find_deps(file, manifest, js, css, true));
	}
}

/**
 * @param {{
 *   client_out_dir?: string;
 *   config: import('types').ValidatedConfig;
 *   input: Record<string, string>;
 *   output_dir: string;
 *   ssr: boolean;
 * }} options
 * @return {import('vite').UserConfig}
 */
export const get_default_config = function ({ client_out_dir, config, input, output_dir, ssr }) {
	return {
		base: assets_base(config),
		build: {
			cssCodeSplit: true,
			manifest: true,
			outDir: ssr ? `${output_dir}/server` : `${client_out_dir}/immutable`,
			polyfillDynamicImport: false,
			rollupOptions: {
				input,
				output: {
					format: 'esm',
					entryFileNames: ssr ? '[name].js' : '[name]-[hash].js',
					chunkFileNames: 'chunks/[name]-[hash].js',
					assetFileNames: 'assets/[name]-[hash][extname]'
				},
				preserveEntrySignatures: 'strict'
			},
			ssr
		},
		plugins: [
			svelte({
				...config,
				compilerOptions: {
					...config.compilerOptions,
					hydratable: !!config.kit.browser.hydrate
				},
				configFile: false
			})
		],
		// prevent Vite copying the contents of `config.kit.files.assets`,
		// if it happens to be 'public' instead of 'static'
		publicDir: false,
		resolve: {
			alias: get_aliases(config)
		}
	};
};

/**
 * @param {import('types').ValidatedConfig} config
 * @returns {string}
 */
export function assets_base(config) {
	// TODO this is so that Vite's preloading works. Unfortunately, it fails
	// during `svelte-kit preview`, because we use a local asset path. This
	// may be fixed in Vite 3: https://github.com/vitejs/vite/issues/2009
	const { base, assets } = config.kit.paths;
	return `${assets || base}/${config.kit.appDir}/immutable/`;
}
