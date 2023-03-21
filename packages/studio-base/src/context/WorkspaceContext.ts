// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { createContext, Dispatch, SetStateAction, useMemo, useState } from "react";
import { DeepReadonly } from "ts-essentials";
import { StoreApi, useStore } from "zustand";

import { AppSetting } from "@foxglove/studio-base/AppSetting";
import { useCurrentUser } from "@foxglove/studio-base/context/CurrentUserContext";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks";
import useGuaranteedContext from "@foxglove/studio-base/hooks/useGuaranteedContext";
import isDesktopApp from "@foxglove/studio-base/util/isDesktopApp";

export type SidebarItemKey =
  | "account"
  | "add-panel"
  | "connection"
  | "extensions"
  | "help"
  | "layouts"
  | "panel-settings"
  | "preferences"
  | "studio-logs-settings"
  | "variables";

export type LeftSidebarItemKey = "topics" | "variables" | "studio-logs-settings";
export type RightSidebarItemKey = "panel-settings" | "events";

export type WorkspaceContextStore = DeepReadonly<{
  layoutMenuOpen: boolean;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  leftSidebarItem: undefined | LeftSidebarItemKey;
  leftSidebarSize: undefined | number;
  rightSidebarItem: undefined | RightSidebarItemKey;
  rightSidebarSize: undefined | number;
  sidebarItem: undefined | SidebarItemKey;
}>;

export const WorkspaceContext = createContext<undefined | StoreApi<WorkspaceContextStore>>(
  undefined,
);

WorkspaceContext.displayName = "WorkspaceContext";

export const WorkspaceStoreSelectors = {
  selectPanelSettingsOpen: (store: WorkspaceContextStore): boolean =>
    store.sidebarItem === "panel-settings" || store.rightSidebarItem === "panel-settings",
};

/**
 * Fetches values from the workspace store.
 */
export function useWorkspaceStore<T>(
  selector: (store: WorkspaceContextStore) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const context = useGuaranteedContext(WorkspaceContext);
  return useStore(context, selector, equalityFn);
}

export type WorkspaceActions = {
  openPanelSettings: () => void;
  openAccountSettings: () => void;
  openLayoutBrowser: () => void;
  selectSidebarItem: (selectedSidebarItem: undefined | SidebarItemKey) => void;
  selectLeftSidebarItem: (item: undefined | LeftSidebarItemKey) => void;
  selectRightSidebarItem: (item: undefined | RightSidebarItemKey) => void;
  setLayoutMenuOpen: Dispatch<SetStateAction<boolean>>;
  setLeftSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setLeftSidebarSize: (size: undefined | number) => void;
  setRightSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setRightSidebarSize: (size: undefined | number) => void;
};

function setterValue<T>(action: SetStateAction<T>, value: T): T {
  if (action instanceof Function) {
    return action(value);
  }

  return action;
}

/**
 * Provides various actions to manipulate the workspace state.
 */
export function useWorkspaceActions(): WorkspaceActions {
  const { setState: set } = useGuaranteedContext(WorkspaceContext);

  const { signIn } = useCurrentUser();
  const supportsAccountSettings = signIn != undefined;

  const [currentEnableNewTopNav = false] = useAppConfigurationValue<boolean>(
    AppSetting.ENABLE_NEW_TOPNAV,
  );
  const [initialEnableNewTopNav] = useState(currentEnableNewTopNav);
  const enableNewTopNav = isDesktopApp() ? initialEnableNewTopNav : currentEnableNewTopNav;

  return useMemo(() => {
    return {
      openPanelSettings: () =>
        enableNewTopNav
          ? set({ rightSidebarItem: "panel-settings", rightSidebarOpen: true })
          : set({ sidebarItem: "panel-settings" }),

      openAccountSettings: () => supportsAccountSettings && set({ sidebarItem: "account" }),

      openLayoutBrowser: () =>
        enableNewTopNav ? set({ layoutMenuOpen: true }) : set({ sidebarItem: "layouts" }),

      setLayoutMenuOpen: (setter: SetStateAction<boolean>) => {
        set((oldValue) => {
          const layoutMenuOpen = setterValue(setter, oldValue.layoutMenuOpen);
          return { layoutMenuOpen };
        });
      },

      selectSidebarItem: (selectedSidebarItem: undefined | SidebarItemKey) =>
        set({ sidebarItem: selectedSidebarItem }),

      selectLeftSidebarItem: (selectedLeftSidebarItem: undefined | LeftSidebarItemKey) => {
        set({
          leftSidebarItem: selectedLeftSidebarItem,
          leftSidebarOpen: selectedLeftSidebarItem != undefined,
        });
      },

      selectRightSidebarItem: (selectedRightSidebarItem: undefined | RightSidebarItemKey) => {
        set({
          rightSidebarItem: selectedRightSidebarItem,
          rightSidebarOpen: selectedRightSidebarItem != undefined,
        });
      },

      setLeftSidebarOpen: (setter: SetStateAction<boolean>) => {
        set((oldValue) => {
          const leftSidebarOpen = setterValue(setter, oldValue.leftSidebarOpen);
          if (leftSidebarOpen) {
            return {
              leftSidebarOpen,
              leftSidebarItem: oldValue.leftSidebarItem ?? "topics",
            };
          } else {
            return { leftSidebarOpen: false };
          }
        });
      },

      setLeftSidebarSize: (leftSidebarSize: undefined | number) => set({ leftSidebarSize }),

      setRightSidebarOpen: (setter: SetStateAction<boolean>) => {
        set((oldValue) => {
          const rightSidebarOpen = setterValue(setter, oldValue.rightSidebarOpen);
          if (rightSidebarOpen) {
            return {
              rightSidebarOpen,
              rightSidebarItem: oldValue.rightSidebarItem ?? "panel-settings",
            };
          } else {
            return { rightSidebarOpen: false };
          }
        });
      },

      setRightSidebarSize: (rightSidebarSize: undefined | number) => set({ rightSidebarSize }),
    };
  }, [enableNewTopNav, set, supportsAccountSettings]);
}
