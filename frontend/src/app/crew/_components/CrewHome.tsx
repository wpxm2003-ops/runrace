"use client";

import type { User } from "firebase/auth";
import type { CrewView } from "@/lib/api/types";
import { CrewHeaderSection } from "./CrewHeaderSection";
import { CrewBoardSection } from "./CrewBoardSection";
import { CrewHeatmapSection } from "./CrewHeatmapSection";
import { CrewRacesSection } from "./CrewRacesSection";
import { CrewMatchSection } from "./CrewMatchSection";
import { CrewHallOfFameSection } from "./CrewHallOfFameSection";
import { CrewDiscovery } from "./CrewDiscovery";

/** 크루 홈 — 헤더 + 이번 달 보드(목표·넛지) + 잔디 + 레이스/대항전 + 명예의 전당 + 둘러보기. */
export function CrewHome({ crew, user }: { crew: CrewView; user: User }) {
  return (
    <>
      <CrewHeaderSection crew={crew} />
      <CrewBoardSection crew={crew} user={user} />
      <CrewHeatmapSection user={user} />
      <CrewRacesSection user={user} />
      <CrewMatchSection user={user} isLeader={crew.isLeader} />
      <CrewHallOfFameSection user={user} />
      <CrewDiscovery user={user} />
    </>
  );
}
