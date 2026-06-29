import { defineConfig } from "rolldown";
import sbom from "rollup-plugin-sbom";

export default defineConfig({
  input: {
    index: "index.js"
  },
  output: {
    dir: "dist",
    format: "esm",
    minify: true,
    cleanDir: true,
  },
  platform: "node",
  plugins: [
    sbom({
      includeWellKnown: false,
      outDir: "",
      outFilename: "index.js.cdx",
      saveTimestamp: false,
      afterCollect(bom) {
        for (const tool of bom.metadata.tools.tools) {
          tool.version = undefined;
        }
      },
    }),
    {
      name: "emit-package-json",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "package.json",
          source: JSON.stringify({ type: "module" }),
        });
      },
    },
  ],
});
