import path from "path";
import {
  Compiler as WebpackCompiler,
  Configuration as WebpackConfiguration,
  Stats as WebpackStats,
} from "webpack";
// import vite from "vite";
import fs from "fs-extra";

type PluginName = "react";
const PLUGIN_NAME: PluginName = "react";

type BuildSystem = "vite" | "react-scripts";

type PluginConfig = {
  buildSystem?: BuildSystem; // Default will be detected on node_modules
  entryPoint?: string; // Default is ./src/index.js
  publicDirectory?: string; // Default is ./public
  outputDirectory?: string; // Default is .react
  reloadHandler?: boolean; // Default is false
};

type Paths = {
  appPath: string;
  appPublic: string;
  appHtml: string;
  appIndexJs: string;
  appSrc: string;
};

type ServerlessCustom = {
  esbuild?: {
    outputWorkFolder?: string;
    outputBuildFolder?: string;
  };
  react?: PluginConfig;
  "serverless-offline"?: {
    location?: string;
  };
};

type ServerlessService = {
  service: string;
  custom?: ServerlessCustom;
  provider: {
    stage: string;
    environment?: { [key: string]: string | { Ref?: string } };
  };
  getAllFunctions: () => string[];
  getFunction: (functionName: string) => {
    name: string;
    events?: any[];
  };
};

type ServerlessConfig = {
  servicePath: string;
};

type Serverless = {
  service: ServerlessService;
  pluginManager: {
    spawn: (command: string) => Promise<void>;
  };
  config: any;
};

type Options = {
  verbose?: boolean;
  log?: ServerlessLog;
};

type ServerlessLog = ((message: string) => void) & {
  verbose: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
};

class Log {
  constructor(private options: Options) {}

  static msg = (message: string) => {
    return `[${PLUGIN_NAME}] ${message}`;
  };

  log = (message: string) => {
    if (this.options.log) {
      this.options.log(Log.msg(message));
    } else {
      console.log(Log.msg(message));
    }
  };

  verbose = (message: string) => {
    if (this.options.log) {
      this.options.log.verbose(Log.msg(message));
    } else {
      console.log(Log.msg(message));
    }
  };

  warning = (message: string) => {
    if (this.options.log) {
      this.options.log.warning(Log.msg(message));
    } else {
      console.warn(Log.msg(message));
    }
  };

  error = (message: string) => {
    if (this.options.log) {
      this.options.log.error(Log.msg(message));
    } else {
      console.error(Log.msg(message));
    }
  };
}

class ServerlessReact {
  log: Log;

  serverless: Serverless;
  serverlessConfig: ServerlessConfig;
  pluginConfig: PluginConfig;

  paths?: Paths;

  hooks: {
    [key: string]: () => Promise<void>;
  };

  constructor(serverless: Serverless, protected options: Options) {
    this.serverless = serverless;
    this.serverlessConfig = serverless.config;
    this.pluginConfig =
      (this.serverless.service.custom &&
        this.serverless.service.custom[PLUGIN_NAME]) ||
      {};

    this.log = new Log(options);

    this.hooks = {
      initialize: async () => {},
      "before:offline:start": async () => {
        this.log.verbose("before:offline:start");
        await this.build(this.pluginConfig.reloadHandler || false);
      },
      "before:package:createDeploymentArtifacts": async () => {
        this.log.verbose("before:package:createDeploymentArtifacts");
        await this.build(false);
      },
    };
  }

  get outputPath() {
    let destination: string | undefined = undefined;

    const { esbuild } = this.serverless.service.custom || {};

    if (esbuild) {
      const outputWorkFolder = esbuild.outputWorkFolder || ".esbuild";
      const outputBuildFolder = esbuild.outputBuildFolder || ".build";
      destination = path.join(outputWorkFolder, outputBuildFolder);
    }

    if (!destination) {
      throw new Error(
        `Unknown destination. This plugin only supports serverless-esbuild.`
      );
    }

    return path.join(
      this.serverlessConfig.servicePath,
      destination,
      this.pluginConfig.outputDirectory || `.${PLUGIN_NAME}`
    );
  }

  get buildSystem(): BuildSystem {
    let requiredModules: string[] = [];
    let { buildSystem } = this.pluginConfig;

    if (!buildSystem) {
      if (
        fs.existsSync(
          path.join(this.serverlessConfig.servicePath, "node_modules", "vite")
        )
      ) {
        buildSystem = "vite";
      }

      if (
        fs.existsSync(
          path.join(
            this.serverlessConfig.servicePath,
            "node_modules",
            "react-scripts"
          )
        )
      ) {
        buildSystem = "react-scripts";
      }
    }

    if (buildSystem === "vite") {
      requiredModules.push("vite");
    }

    if (buildSystem === "react-scripts") {
      requiredModules.push("react-scripts");
    }

    const hasModules = requiredModules.every((module) =>
      fs.existsSync(
        path.join(this.serverlessConfig.servicePath, "node_modules", module)
      )
    );

    if (!hasModules) {
      throw new Error(
        `Could not find required modules: ${requiredModules.join(
          ", "
        )}. Please ensure they are in your project dependencies.`
      );
    }

    if (!buildSystem) {
      throw new Error(
        `Could not detect build system. Please set it using the custom.react.buildSystem property in serverless.yml.`
      );
    }

    return buildSystem;
  }

  build = async (watch: boolean): Promise<void> => {
    if (this.buildSystem === "vite") {
      await this.buildWithVite();
    }

    if (this.buildSystem === "react-scripts") {
      const { config, compiler } = await this.buildWithWebpack();
      if (watch) {
        await this.watchWebpack(config, compiler);
      }
    }
  };

  buildWithVite = async (): Promise<void> => {
    const vite = (await import("vite")).default;
    await vite.build({ build: { outDir: this.outputPath } });
  };

  buildWithWebpack = async (): Promise<{
    config: WebpackConfiguration;
    compiler: WebpackCompiler;
  }> => {
    process.env.BABEL_ENV = "production";
    process.env.NODE_ENV = "production";

    require(path.join(
      this.serverlessConfig.servicePath,
      "node_modules",
      "react-scripts",
      "config",
      "env"
    ));

    const paths = require(path.join(
      this.serverlessConfig.servicePath,
      "node_modules",
      "react-scripts",
      "config",
      "paths"
    ));

    if (this.pluginConfig.entryPoint) {
      paths.appIndexJs = path.join(
        this.serverlessConfig.servicePath,
        this.pluginConfig.entryPoint
      );
      paths.appSrc = path.dirname(paths.appIndexJs);
      // configFactory.paths = paths;
      // TODO: Other things like:
      // - paths.testsSetup
      // - paths.proxySetup
      // - paths.swSrc
    }

    if (this.pluginConfig.publicDirectory) {
      paths.appPublic = path.join(
        this.serverlessConfig.servicePath,
        this.pluginConfig.publicDirectory
      );
      paths.appHtml = path.join(paths.appPublic, "index.html");
    }

    this.paths = paths;

    const configFactory = require(path.join(
      this.serverlessConfig.servicePath,
      "node_modules",
      "react-scripts",
      "config",
      "webpack.config.js"
    ));

    const { checkBrowsers } = require("react-dev-utils/browsersHelper");
    await checkBrowsers(paths.appPath, false);

    const config = configFactory("production");

    if (!config.output) {
      throw new Error("No output config in webpack config");
    }

    config.output.path = this.outputPath;
    this.log.verbose(`Webpack output path: ${config.output.path}`);

    // TODO: Watch paths.appPublic?
    fs.emptyDirSync(config.output.path);

    const webpack = require("webpack");
    const compiler = webpack(config) as WebpackCompiler;

    return new Promise((resolve, reject) => {
      this.log.verbose(`Starting webpack build...`);

      compiler.run((err, stats) => {
        try {
          this.webpackHandler(config, err, stats);
        } catch (error: any) {
          this.log.error(error.message);
          reject();
        }

        resolve({ config, compiler });
      });
    });
  };

  copyStatic = async (config: WebpackConfiguration) => {
    this.log.verbose(`Copying static files...`);
    if (!config.output || !config.output.path) {
      throw new Error("No webpack config output path");
    }

    if (!this.paths) {
      throw new Error("No paths");
    }

    const { appHtml } = this.paths;

    fs.copySync(this.paths.appPublic, config.output.path, {
      dereference: true,
      filter: (file) => file !== appHtml,
    });
  };

  watchWebpack = async (
    config: WebpackConfiguration,
    compiler: WebpackCompiler
  ) => {
    this.log.verbose(`Watching for changes...`);
    compiler.watch({}, (err, stats) => {
      this.log.verbose(`Webpack detected changes...`);
      try {
        this.webpackHandler(config, err, stats);
      } catch (error: any) {
        this.log.error(error.message);
        return;
      }
    });
  };

  webpackHandler = (
    config: WebpackConfiguration,
    err?: Error | null,
    stats?: WebpackStats
  ) => {
    this.handleWebpackError(err);
    this.handleWebpackStats(stats);

    this.copyStatic(config).then(() => {
      this.log.verbose(`Webpack build complete.`);
    });
  };

  handleWebpackError = (error: Error | null | undefined) => {
    if (!error) {
      return;
    }

    throw new Error(error.message);
  };

  handleWebpackStats = (stats?: WebpackStats) => {
    if (!stats) {
      throw new Error(`Webpack did not emit stats.`);
    }

    const statsJson = stats.toJson();

    const { errors, warnings } = statsJson;

    if (errors && errors.length > 0) {
      throw new Error(
        `Webpack failed to compile:\n${errors.map((e) => e.message).join("\n")}`
      );
    }

    if (warnings && warnings.length > 0) {
      const message = `Webpack compiled with warnings:\n${warnings
        .map((e) => e.message)
        .join("\n")}`;
      if (process.env.CI) {
        throw new Error(message);
      } else {
        this.log.warning(message);
      }
    }
  };
}

module.exports = ServerlessReact;
