import path from "path";
import webpack, { Configuration } from "webpack";

type PluginName = "react";
const PLUGIN_NAME: PluginName = "react";
type SupportedPackagers = "yarn"; // TODO npm/pnpm

type PluginConfig = {
  packager?: SupportedPackagers;
  webpackConfig?: string;
  entryPoint?: string;
};

type PluginCommands = {
  [key in PluginName]: {
    usage: string;
    lifecycleEvents: string[];
    commands: {
      [key: string]: {
        type: string;
        lifecycleEvents: string[];
        commands?: {
          [key: string]: {
            type: string;
            lifecycleEvents: string[];
          };
        };
      };
    };
  };
};

type WebpackPluginConfig = {
  packager: SupportedPackagers;
  webpackConfig: string;
  packagePath: string;
  includeModules: {
    packagePath: string;
    nodeModulesRelativeDir: string;
  };
  packagerOptions: {
    lockFile: string;
  };
};

type ServerlessCustom = {
  [key in PluginName]?: PluginConfig;
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
};

type Log = ((message: string) => void) & {
  verbose: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
};

type Progress = {
  get: () => {
    update: (message: string) => void;
    notice: (message: string) => void;
    remove: () => void;
  };
};

type Lib = {
  serverless?: Serverless;
  webpack: {
    isLocal?: boolean;
  };
  entries?: {
    [name: string]: string | string[];
  };
  options?: { [name: string]: string | boolean | number } & {
    param?: string[];
  };
};

const DEFAULT_LOG: Log = (message?: string) =>
  console.log(`[${PLUGIN_NAME}] ${message}`);
DEFAULT_LOG.verbose = (message?: string) =>
  console.log(`[${PLUGIN_NAME}] ${message}`);
DEFAULT_LOG.warning = (message?: string) =>
  console.log(`[${PLUGIN_NAME}] ${message}`);
DEFAULT_LOG.error = (message?: string) =>
  console.log(`[${PLUGIN_NAME}] ${message}`);

const DEFAULT_PROGRESS: Progress = {
  get: () => ({
    update: (message: string) => DEFAULT_LOG(message),
    notice: (message: string) => DEFAULT_LOG(message),
    remove: () => {},
  }),
};

class ServerlessReact {
  lib: Lib;
  log = DEFAULT_LOG;
  progress = DEFAULT_PROGRESS;

  serverless: Serverless;
  serverlessConfig: ServerlessConfig;
  service: ServerlessService;
  pluginConfig: PluginConfig;
  configuration: {
    config: WebpackPluginConfig;
  };

  commands: PluginCommands;
  hooks: {
    [key: string]: () => Promise<void>;
  };

  constructor(serverless: Serverless, protected options?: Options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.serverlessConfig = serverless.config;
    this.pluginConfig =
      (this.service.custom && this.service.custom[PLUGIN_NAME]) || {};

    console.log("!!!! this.serverless", this.serverless);

    this.configuration = {
      config: this.prepareWebpackPluginConfig(this.pluginConfig),
    };

    this.lib = {
      webpack: {},
    };

    if (!this.options) {
      this.options = {};
    }

    this.commands = {
      react: {
        usage: "Bundle React",
        lifecycleEvents: ["react"],
        commands: {
          validate: {
            type: "entrypoint",
            lifecycleEvents: ["validate"],
          },
          build: {
            type: "entrypoint",
            lifecycleEvents: ["build"],
            commands: {
              watch: {
                type: "entrypoint",
                lifecycleEvents: ["build"],
              },
            },
          },
          package: {
            type: "entrypoint",
            lifecycleEvents: [
              "packExternalModules",
              "packageModules",
              "copyExistingArtifacts",
            ],
          },
        },
      },
    };

    this.hooks = {
      initialize: async () => {},
      "react:validate": async () => {
        console.log("!!!! react:validate");
      },
      "react:build": async () => {
        console.log("!!!! react:build");
      },
      "before:offline:start:init": async () => {
        this.log.verbose("before:offline:start:init");
        await this.build();
      },
    };
  }

  build = async (): Promise<void> => {
    const webpackConfig = path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.webpackConfig ||
        "node_modules/react-scripts/webpack.config.js"
    );

    const configFactory = (await import(webpackConfig)).default;
    const config: Configuration = configFactory("production");

    config.entry = this.pluginConfig.entryPoint || config.entry;

    const compiler = webpack(config);

    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) {
          return reject(err);
        }
        if (!stats) {
          return reject(new Error("No stats from webpack"));
        }
        if (stats.hasErrors()) {
          // TODO Formatting like build.js
          return reject(new Error(stats.toJson().errors?.join("\n\n")));
        }

        // TODO fail on process.env.CI + warnings
        console.log("Compiled with warnings.\n");
        console.log(stats.toJson().warnings?.join("\n\n"));

        resolve();
      });
    });
  };

  prepareWebpackPluginConfig = (
    pluginConfig: PluginConfig
  ): WebpackPluginConfig => {
    return {
      packager: pluginConfig.packager || "yarn",
      webpackConfig: "./node_modules/react-scripts/config/webpack.config.js",
      packagePath: `./package.json`,
      includeModules: {
        packagePath: `./package.json`,
        nodeModulesRelativeDir: `./node_modules`,
      },
      packagerOptions: {
        lockFile: "./yarn.lock",
      },
    };
  };
}

module.exports = ServerlessReact;
