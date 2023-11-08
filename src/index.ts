// import ServerlessWebpack from "serverless-webpack";

type PluginName = "webpack-spa";
const PLUGIN_NAME: PluginName = "webpack-spa";

type PluginConfig = {
  stages?: string[];
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
};

type Options = {
  stage: string;
};

class ServerlessWebpackSpa {
  service: ServerlessService;
  config: PluginConfig;
  hooks: {
    [key: string]: () => Promise<void>;
  };

  constructor(serverless: Serverless, private options: Options) {
    this.service = serverless.service;
    this.config =
      (this.service.custom && this.service.custom[PLUGIN_NAME]) || {};

    this.options = options;

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
      },
      "before:offline:start:init": async () => {
        console.log("!!!! before:offline:start:init");
      },
      "before:step-functions-offline:start": async () => {
        console.log("!!!! before:step-functions-offline:start");
      },
    };
  }

  get stage() {
    return (
      (this.options && this.options.stage) ||
      (this.service.provider && this.service.provider.stage)
    );
  }

  shouldExecute() {
    if (this.config.stages && !this.config.stages.includes(this.stage)) {
      return false;
    }
    return true;
  }

  async beforeHandler() {
    if (this.shouldExecute()) {
      console.log(`${PLUGIN_NAME} Starting!`);
    }
  }
}

module.exports = ServerlessWebpackSpa;
