import path from "path";
import webpack from "webpack";
import fs from "fs-extra";

type PluginName = "react";
const PLUGIN_NAME: PluginName = "react";

type PluginConfig = {
  webpackConfig?: string; // Default is node_modules/react-scripts/config/webpack.config.js
  // entryPoint?: string; // Default is ./src/index.js
  outputDirectory?: string; // Default is .react
  // keepOutputDirectory?: boolean; // Default is false, TODO: implement
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

  _webpackConfig?: webpack.Configuration;
  get webpackConfig(): webpack.Configuration {
    if (!this._webpackConfig) {
      throw new Error("Webpack config is not set");
    }
    return this._webpackConfig;
  }
  set webpackConfig(config: webpack.Configuration) {
    this._webpackConfig = config;
  }

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

    console.log("!!! this.serverless", this.serverless);

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

    // TODO: find where build artifacts are stored
    //       - copy .react to that location
    this.hooks = {
      initialize: async () => {},
      "react:validate": async () => {
        this.log.verbose("react:validate");
      },
      "react:build": async () => {
        this.log.verbose("react:build");
      },
      "before:offline:start": async () => {
        this.log.verbose("before:offline:start");
        const { compiler } = await this.build();
        const destination =
          this.serverless.service.custom?.["serverless-offline"]?.location;
        console.log("!!! bos destination", destination);
        await this.watch(compiler);
      },
      "after:offline:start": async () => {
        this.log.verbose("after:offline:start");
        const destination =
          this.serverless.service.custom?.["serverless-offline"]?.location;
        await this.copy(destination);
      },
      "before:package:createDeploymentArtifacts": async () => {
        this.log.verbose("before:package:createDeploymentArtifacts");
      },
      "after:package:createDeploymentArtifacts": async () => {
        this.log.verbose("after:package:createDeploymentArtifacts");
      },
    };
  }

  build = async (): Promise<{
    compiler: webpack.Compiler;
  }> => {
    // TODO Check if react-scripts exists
    process.env.BABEL_ENV = "production";
    process.env.NODE_ENV = "production";

    require(path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.webpackConfig || "node_modules/react-scripts/config/env"
    ));

    const paths = require(path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.webpackConfig ||
        "node_modules/react-scripts/config/paths"
    ));

    const { checkBrowsers } = require("react-dev-utils/browsersHelper");
    await checkBrowsers(paths.appPath, false);

    const configFactory = require(path.join(
      this.serverlessConfig.servicePath,
      this.pluginConfig.webpackConfig ||
        "node_modules/react-scripts/config/webpack.config.js"
    ));

    this.webpackConfig = configFactory("production");

    if (!this.webpackConfig.output) {
      throw new Error("No output config in webpack config");
    }

    this.webpackConfig.output.path = path.join(
      this.serverlessConfig.servicePath,
      `.${PLUGIN_NAME}`
    );

    fs.emptyDirSync(this.webpackConfig.output.path);
    fs.copySync(paths.appPublic, this.webpackConfig.output.path, {
      dereference: true,
      filter: (file) => file !== paths.appHtml,
    });

    const compiler = webpack(this.webpackConfig);

    return new Promise((resolve, reject) => {
      this.log.verbose(
        `[${this.webpackConfig.entry}] Starting webpack build...`
      );

      compiler.run((err, stats) => {
        try {
          this.handleWebpackError(err);
        } catch (error: any) {
          this.log.error(`[${this.webpackConfig.entry}] ${error.message}`);
          return reject();
        }

        try {
          this.handleWebpackStats(stats);
        } catch (error: any) {
          this.log.error(`[${this.webpackConfig.entry}] ${error.message}`);
          return reject();
        }

        this.log.verbose(
          `[${this.webpackConfig.entry}] Webpack build complete.`
        );
        resolve({ compiler });
      });
    });
  };

  copy = async (destination?: string) => {
    this.log.verbose(
      `[${this.webpackConfig.entry}] Copying build artifacts...`
    );
    console.log("!!! destination", destination);
    console.log("!!! getAllFunctions", this.service.getAllFunctions());

    // const output = path.join(
    //   this.serverlessConfig.servicePath,
    //   this.pluginConfig.outputDirectory || ".react"
    // );

    // const functions = this.service.getAllFunctions();

    // for (const [functionAlias, fn] of Object.entries(finctions)) {
    //   const functionConfig = this.service.getFunction(functionName);
    //   const functionPath = path.join(
    //     this.serverlessConfig.servicePath,
    //     functionConfig.name
    //   );

    //   if (fs.existsSync(functionPath)) {
    //     this.log.verbose(`Copying to ${functionPath}`);
    //     fs.copySync(output, functionPath);
    //   }
    // }
  };

  watch = async (_compiler: webpack.Compiler) => {
    this.log.verbose(
      `[${this.webpackConfig.entry}] TODO: Watching for changes...`
    );
  };

  handleWebpackError = (error: Error | null | undefined) => {
    if (!error) {
      return;
    }

    throw new Error(error.message);
  };

  handleWebpackStats = (stats?: webpack.Stats) => {
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
