"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { DistanceUnit } from "./units";

const STORAGE_KEY = "runrace_unit";

/** 단위는 언어와 별개 선호값. 저장된 값이 없으면 지역으로만 추측(미국=마일), 그 외 km. */
function getInitialUnit(): DistanceUnit {
  if (typeof window === "undefined") return "km";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "km" || stored === "mi") return stored;
  const region = navigator.language.split("-")[1]?.toUpperCase();
  return region === "US" ? "mi" : "km";
}

type UnitContextValue = {
  unit: DistanceUnit;
  setUnit: (next: DistanceUnit) => void;
};

const UnitContext = createContext<UnitContextValue | null>(null);

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<DistanceUnit>("km");

  useEffect(() => {
    setUnitState(getInitialUnit());
  }, []);

  const setUnit = useCallback((next: DistanceUnit) => {
    localStorage.setItem(STORAGE_KEY, next);
    setUnitState(next);
  }, []);

  return (
    <UnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnit must be used within UnitProvider");
  return ctx;
}
