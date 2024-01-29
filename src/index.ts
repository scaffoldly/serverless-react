import path from "path";
import webpack, { Configuration } from "webpack";

type PluginName = "react";
const PLUGIN_NAME: PluginName = "react";

type PluginConfig = {
  webpackConfig?: string; // Default is node_modules/react-scripts/config/webpack.config.js
  entryPoint?: string; // Default is src/index.js
  outputDirectory?: string; // Default is .react
  keepOutputDirectory?: boolean; // Default is false
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
  log = DEFAULT_LOG;
  progress = DEFAULT_PROGRESS;

  serverless: Serverless;
  serverlessConfig: ServerlessConfig;
  service: ServerlessService;
  pluginConfig: PluginConfig;

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
      "before:offline:start": async () => {
        this.log.verbose("before:offline:start");
        await this.build();
      },
      "before:offline:start:init": async () => {
        this.log.verbose("before:offline:start:init");
        await this.build();
      },
    };
  }

  build = async (): Promise<void> => {
    // TODO Check if react-scripts exists

    const webpackConfig = path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.webpackConfig ||
        "node_modules/react-scripts/config/webpack.config.js"
    );

    const configFactory = require(webpackConfig);
    const config: Configuration = configFactory(
      process.env.NODE_ENV === "development" ? "development" : "production"
    );

    if (!config.output) {
      throw new Error("No output config in webpack config");
    }

    config.output.path = path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.outputDirectory || `.${PLUGIN_NAME}`
    );

    // TODO use config.entry as a fallback
    config.entry = path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.entryPoint || "src/index.js"
    );

    // TODO Copy public dir

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
}

module.exports = ServerlessReact;
