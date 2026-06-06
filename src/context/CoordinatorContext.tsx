import React, { createContext, useContext } from "react";
import { useMachine } from "@xstate/react";
import { parentCoordinatorMachine } from "../workflow/parentCoordinator";

type CoordinatorMachineReturn = ReturnType<typeof useMachine<typeof parentCoordinatorMachine>>;

interface CoordinatorContextValue {
  state: CoordinatorMachineReturn[0];
  send: CoordinatorMachineReturn[1];
}

const CoordinatorContext = createContext<CoordinatorContextValue | undefined>(undefined);

export const CoordinatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, send] = useMachine(parentCoordinatorMachine);

  return (
    <CoordinatorContext.Provider value={{ state, send }}>{children}</CoordinatorContext.Provider>
  );
};

export const useCoordinator = () => {
  const context = useContext(CoordinatorContext);
  if (context === undefined) {
    throw new Error("useCoordinator must be used within a CoordinatorProvider");
  }
  return context;
};
