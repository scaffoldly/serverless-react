import path from "path";
import webpack from "webpack";
import fs from "fs-extra";

type PluginName = "react";
const PLUGIN_NAME: PluginName = "react";

type PluginConfig = {
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
        const { compiler } = await this.build();
        if (this.pluginConfig.reloadHandler) {
          await this.watch(compiler);
        }
      },
      "before:package:createDeploymentArtifacts": async () => {
        this.log.verbose("before:package:createDeploymentArtifacts");
        await this.build();
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

  build = async (): Promise<{
    compiler: webpack.Compiler;
  }> => {
    // TODO Check if react-scripts exists
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

    this.webpackConfig = configFactory("production");

    if (!this.webpackConfig.output) {
      throw new Error("No output config in webpack config");
    }

    this.webpackConfig.output.path = this.outputPath;
    this.log.verbose(`Webpack output path: ${this.webpackConfig.output.path}`);

    // TODO: Watch paths.appPublic?
    fs.emptyDirSync(this.webpackConfig.output.path);

    const compiler = webpack(this.webpackConfig);

    return new Promise((resolve, reject) => {
      this.log.verbose(`Starting webpack build...`);

      compiler.run((err, stats) => {
        try {
          this.webpackHandler(err, stats);
        } catch (error: any) {
          this.log.error(error.message);
          reject();
        }

        resolve({ compiler });
      });
    });
  };

  copyStatic = async () => {
    this.log.verbose(`Copying static files...`);
    if (
      !this.webpackConfig ||
      !this.webpackConfig.output ||
      !this.webpackConfig.output.path
    ) {
      throw new Error("No webpack config output path");
    }

    if (!this.paths) {
      throw new Error("No paths");
    }

    const { appHtml } = this.paths;

    fs.copySync(this.paths.appPublic, this.webpackConfig.output.path, {
      dereference: true,
      filter: (file) => file !== appHtml,
    });
  };

  watch = async (compiler: webpack.Compiler) => {
    this.log.verbose(`Watching for changes...`);
    compiler.watch({}, (err, stats) => {
      this.log.verbose(`Webpack detected changes...`);
      try {
        this.webpackHandler(err, stats);
      } catch (error: any) {
        this.log.error(error.message);
        return;
      }
    });
  };

  webpackHandler = (err?: Error | null, stats?: webpack.Stats) => {
    this.handleWebpackError(err);
    this.handleWebpackStats(stats);

    this.copyStatic().then(() => {
      this.log.verbose(`Webpack build complete.`);
    });
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
