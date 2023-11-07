type PluginName = "serverless-webpack-spa";
const PLUGIN_NAME: PluginName = "serverless-webpack-spa";

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
      "before:run:run": this.beforeHandler.bind(this),
      "after:run:run": this.afterHandler.bind(this),
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
      console.log(`${PLUGIN_NAME} Running`);
    }
  }

  async afterHandler() {
    if (this.shouldExecute()) {
      console.log(`${PLUGIN_NAME} Ending!`);
    }
  }
}

module.exports = ServerlessWebpackSpa;
