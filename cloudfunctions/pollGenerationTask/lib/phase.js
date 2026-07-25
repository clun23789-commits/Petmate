"use strict";

const GENERATION_PHASE = {
  QUEUED: "queued",
  FETCHING_ASSETS: "fetching_assets",
  FINALIZING: "finalizing",
  COMPLETED: "completed",
  FAILED: "failed",
  TIMEOUT: "timeout"
};

const PHASE_PROGRESS = {
  queued: 0,
  fetching_assets: 35,
  finalizing: 85,
  completed: 100,
  failed: 100,
  timeout: 100
};

function getProgressForPhase(phase) {
  return PHASE_PROGRESS[phase] === undefined ? 0 : PHASE_PROGRESS[phase];
}

module.exports = {
  GENERATION_PHASE,
  PHASE_PROGRESS,
  getProgressForPhase
};
