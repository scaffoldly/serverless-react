type PluginName = "webpack-spa";
const PLUGIN_NAME: PluginName = "webpack-spa";
type SupportedFrameworks = "react";
type SupportedPackagers = "npm" | "yarn";

type PluginConfig = {
  framework?: SupportedFrameworks;
  appDir?: string;
  webpackConfig?: string;
  packager?: SupportedPackagers;
  nodeModulesRelativeDir?: string;
  lockfileRelativePath?: string;
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

type Serverless = {
  service: ServerlessService;
  pluginManager: {
    spawn: (command: string) => Promise<void>;
  };
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

const DEFAULT_LOG: Log = (message?: string) =>
  console.log(`[${PLUGIN_NAME} ${message}`);
DEFAULT_LOG.verbose = (message?: string) =>
  console.log(`[${PLUGIN_NAME} ${message}`);
DEFAULT_LOG.warning = (message?: string) =>
  console.log(`[${PLUGIN_NAME} ${message}`);
DEFAULT_LOG.error = (message?: string) =>
  console.log(`[${PLUGIN_NAME} ${message}`);

const DEFAULT_PROGRESS = {
  get: () => ({
    update: (message: string) => DEFAULT_LOG(message),
    notice: (message: string) => DEFAULT_LOG(message),
    remove: () => {},
  }),
};

class ServerlessWebpackSpa {
  // compile = require("serverless-webpack/lib/compile");
  validate = require("serverless-webpack/lib/validate").validate;

  log = DEFAULT_LOG;
  progress = DEFAULT_PROGRESS;

  service: ServerlessService;
  pluginConfig: PluginConfig;
  configuration: {
    config: WebpackPluginConfig;
  };

  commands: PluginCommands;
  hooks: {
    [key: string]: () => Promise<void>;
  };

  // TODO:
  //   - options
  //   - commands + options
  //   - typescript

  constructor(private serverless: Serverless, protected options?: Options) {
    this.service = serverless.service;
    this.pluginConfig =
      (this.service.custom && this.service.custom[PLUGIN_NAME]) || {};

    this.configuration = {
      config: this.prepareWebpackPluginConfig(this.pluginConfig),
    };

    if (!this.options) {
      this.options = {};
    }

    this.commands = {
      "webpack-spa": {
        usage: "Bundle with Webpack SPA",
        lifecycleEvents: ["webpack-spa"],
        commands: {
          validate: {
            type: "entrypoint",
            lifecycleEvents: ["validate"],
          },
          compile: {
            type: "entrypoint",
            lifecycleEvents: ["compile"],
            commands: {
              watch: {
                type: "entrypoint",
                lifecycleEvents: ["compile"],
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
      "before:package:createDeploymentArtifacts": async () => {
        console.log("!!!! before:package:createDeploymentArtifacts");
      },
      "after:package:createDeploymentArtifacts": async () => {
        console.log("!!!! after:package:createDeploymentArtifacts");
      },
      "before:deploy:function:packageFunction": async () => {
        console.log("!!!! before:deploy:function:packageFunction");
      },
      "before:invoke:local:invoke": async () => {
        console.log("!!!! before:invoke:local:invoke");
      },
      "after:invoke:local:invoke": async () => {
        console.log("!!!! after:invoke:local:invoke");
      },
      "before:run:run": async () => {
        console.log("!!!! before:run:run");
      },
      "after:run:run": async () => {
        console.log("!!!! after:run:run");
      },
      "webpack-spa:webpack": async () => {
        console.log("!!!! webpack-spa:webpack");
      },
      // internal hooks
      "webpack-spa:validate:validate": async () => {
        console.log("!!!! webpack-spa:validate:validate");
        console.log("!!! validate fn", this.validate);
        await this.validate();
      },
      "webpack-spa:compile:compile": async () => {
        console.log("!!!! webpack-spa:compile:compile");
      },
      "webpack-spa:compile:watch:compile": async () => {
        console.log("!!!! webpack-spa:compile:watch:compile");
      },
      "webpack-spa:package:packExternalModules": async () => {
        console.log("!!!! webpack-spa:package:packExternalModules");
      },
      "webpack-spa:package:packageModules": async () => {
        console.log("!!!! webpack-spa:package:packageModules");
      },
      "webpack-spa:package:copyExistingArtifacts": async () => {
        console.log("!!!! webpack-spa:package:copyExistingArtifacts");
      },
      "before:offline:start": async () => {
        console.log("!!!! before:offline:start");
        await this.serverless.pluginManager.spawn("webpack-spa:validate");
      },
      "before:offline:start:init": async () => {
        console.log("!!!! before:offline:start:init");
      },
      "before:step-functions-offline:start": async () => {
        console.log("!!!! before:step-functions-offline:start");
      },
    };
  }

  prepareWebpackPluginConfig = (
    pluginConfig: PluginConfig
  ): WebpackPluginConfig => {
    const { appDir = "." } = pluginConfig;

    if (pluginConfig.framework === "react") {
      return {
        packager: pluginConfig.packager || "npm",
        webpackConfig:
          pluginConfig.webpackConfig ||
          "./node_modules/react-scripts/config/webpack.config.js",
        packagePath: `${appDir}/package.json`,
        includeModules: {
          packagePath: `${appDir}/package.json`,
          nodeModulesRelativeDir:
            pluginConfig.nodeModulesRelativeDir || `${appDir}/node_modules`,
        },
        packagerOptions: {
          lockFile:
            pluginConfig.lockfileRelativePath || `${appDir}/package-lock.json`,
        },
      };
    }

    throw new Error(`Unsupported framework: ${pluginConfig.framework}`);
  };
}

module.exports = ServerlessWebpackSpa;
