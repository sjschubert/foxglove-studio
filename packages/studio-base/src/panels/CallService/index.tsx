// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Button, OutlinedInput, Stack, styled as muiStyled, TextField } from "@mui/material";
import { StrictMode, useEffect, useState } from "react";
import ReactDOM from "react-dom";

import { PanelExtensionContext } from "@foxglove/studio";
import Panel from "@foxglove/studio-base/components/Panel";
import { PanelExtensionAdapter } from "@foxglove/studio-base/components/PanelExtensionAdapter";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";
import { SaveConfig } from "@foxglove/studio-base/types/panels";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

// import { Services } from "./Services";
// import { Config } from "./types";

type CallServiceProps = {
  context: PanelExtensionContext;
};

type State = {
  serviceName: string;
  requestJson: string;
  responseJson: string;
  error?: Error | undefined;
};

export function CallService({ context }: CallServiceProps): JSX.Element {
  // panel extensions must notify when they've completed rendering
  // onRender will setRenderDone to a done callback which we can invoke after we've rendered
  const [renderDone, setRenderDone] = useState<() => void>(() => () => { });
  // const { topics, datatypes, capabilities } = useDataSourceInfo();

  const [state, setState] = useState<State>({
    serviceName: "",
    requestJson: "{}",
    responseJson: "",
  });

  useEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
    };

    return () => {
      context.onRender = undefined;
    };
  }, [context]);

  // Indicate render is complete - the effect runs after the dom is updated
  useEffect(() => {
    renderDone();
  }, [renderDone]);

  if (!context.callService) {
    return (
      <Stack>
        <div>Current connection does not support calling services :/</div>
      </Stack>
    );
  }

  return (
    <Stack>
      <Stack flex="auto" padding={2} gap={1} paddingBottom={0}>
        <div>Hello!</div>

        <TextField
          label="Service name"
          variant="outlined"
          placeholder="Enter service name"
          value={state.serviceName}
          onChange={(event) =>
            setState((oldState) => ({ ...oldState, serviceName: event.target.value }))
          }
        />

        <b>Request:</b>
        <StyledTextarea
          multiline
          placeholder="Enter message content as JSON"
          value={state.requestJson}
          onChange={(event) =>
            setState((oldState) => ({ ...oldState, requestJson: event.target.value }))
          }
        />

        <Button
          variant="contained"
          size="large"
          disabled={state.serviceName === ""}
          onClick={async () => {
            if (!context.callService) {
              return;
            }

            try {
              const response = await context.callService(
                state.serviceName,
                JSON.parse(state.requestJson),
              );
              setState({
                ...state,
                responseJson: JSON.stringify(response) ?? "",
                error: undefined,
              });
            } catch (error) {
              setState({ ...state, error: error as Error });
              console.error(error);
            }
          }}
        >
          Call {state.serviceName}
        </Button>

        <b>Response:</b>
        <StyledTextarea
          multiline
          label="Response"
          error={state.error != undefined}
          value={state.error ? state.error.message : state.responseJson}
        />
      </Stack>
    </Stack>
  );
}

const StyledTextarea = muiStyled(OutlinedInput)(({ theme }) => ({
  width: "100%",
  height: "100%",
  textAlign: "left",
  backgroundColor: theme.palette.background.paper,
  overflow: "hidden",
  padding: theme.spacing(1, 0.5),

  ".MuiInputBase-input": {
    height: "100% !important",
    font: "inherit",
    lineHeight: 1.4,
    fontFamily: fonts.MONOSPACE,
    fontSize: "100%",
    overflow: "auto !important",
    resize: "none",
  },
}));

function initPanel(context: PanelExtensionContext) {
  ReactDOM.render(
    <StrictMode>
      <ThemeProvider isDark={false}>
        <CallService context={context} />
      </ThemeProvider>
    </StrictMode>,
    context.panelElement,
  );
  return () => {
    ReactDOM.unmountComponentAtNode(context.panelElement);
  };
}

type Config = Partial<{
  serviceName: string;
  datatype: string;
  buttonText: string;
  buttonTooltip: string;
  buttonColor: string;
  advancedView: boolean;
  value: string;
}>;
type Props = {
  config: Config;
  saveConfig: SaveConfig<Config>;
};

function ServicesPanelAdapter(props: Props) {
  return (
    <PanelExtensionAdapter
      config={props.config}
      saveConfig={props.saveConfig}
      initPanel={initPanel}
    />
  );
}

ServicesPanelAdapter.panelType = "Services";
ServicesPanelAdapter.defaultConfig = {};

export default Panel(ServicesPanelAdapter);
