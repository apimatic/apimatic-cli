async function SampleWorkflow(workflowCtx, portal) {
  return {
    "Step 1": {
      name: "How to Get Access Token",
      stepCallback: async () => {
        return workflowCtx.showContent(`## Introduction
This is an API Recipe.`);
      }
    },
    "Step 2": {
      name: "Get Session Token",
      stepCallback: async (stepState) => {
        await portal.setConfig((defaultConfig) => ({}));
        return workflowCtx.showEndpoint({
          description:
            "This endpoint initiates session management and returns an access token and client ID that is required in subsequent API requests.",
          endpointPermalink: "$e/Session%20Management/StartSession",
          verify: (response, setError) => {
            if (response.StatusCode == 401 || response.StatusCode == 400) {
              setError("Authentication Token is Required");
              return false;
            } else if (response.StatusCode == 200) {
              return true;
            } else {
              setError("API Call wasn't able to get a valid response. Please try again.");
              return false;
            }
          }
        });
      }
    },
    "Step 3": {
      name: "Get the List of Active Customer",
      stepCallback: async (stepState) => {
        const step2State = stepState?.["Step 2"];
        await portal.setConfig((defaultConfig) => {
          return {
            ...defaultConfig,
            auth: {
              ...defaultConfig.auth,
              bearerAuth: {
                ...defaultConfig.auth.bearerAuth,
                AccessToken: step2State.data?.sessionToken
              }
            },
            config: {
              ...defaultConfig.config
            }
          };
        });
        return workflowCtx.showEndpoint({
          description: "This step fetches the list of active customers.",
          endpointPermalink: "$e/Management/ListActiveCustomers",
          args: {
            body: {
              ClientID: step2State.data?.clientID,
              ClientSecret: step2State.requestData?.args?.body?.clientSecret
            }
          },
          verify: (response, setError) => {
            if (response.StatusCode != 200) {
              setError("Please Try Again. Unable to find the API Spec");
              return false;
            } else {
              return true;
            }
          }
        });
      }
    }
  };
}
