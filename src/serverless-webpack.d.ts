declare module "serverless-webpack/lib" {
  const webpack: {
    isLocal: boolean;
  };
  function prepareOfflineInvoke(): Promise<void>;
  function wpwatch(): Promise<void>;
}
