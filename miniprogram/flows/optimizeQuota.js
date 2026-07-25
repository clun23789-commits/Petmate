"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.applyQuotaToStore = applyQuotaToStore;
exports.syncOptimizeQuota = syncOptimizeQuota;
exports.grantOptimizeQuotaFromAd = grantOptimizeQuotaFromAd;
exports.reserveOptimizationQuota = reserveOptimizationQuota;
exports.releaseOptimizationReservation = releaseOptimizationReservation;
exports.commitOptimizationReservation = commitOptimizationReservation;

const optimizationService = require("../services/optimization");
const { store } = require("../store/core/createStore");

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeQuota(quota) {
    const source = quota || {};
    const grantedCount = normalizeNumber(source.grantedCount);
    const usedCount = normalizeNumber(source.usedCount);
    const reservedCount = normalizeNumber(source.reservedCount);
    const availableCount = Math.max(0, grantedCount - usedCount - reservedCount);

    return {
        grantedCount,
        usedCount,
        reservedCount,
        availableCount,
        remainingCount: availableCount,
        updatedAt: source.updatedAt || new Date().toISOString()
    };
}

function getErrorMessage(error, fallback) {
    return error && error.message ? error.message : fallback;
}

function setQuotaLoading(silent, label) {
    if (silent) {
        return;
    }

    store.setState((state) => ({
        optimizeState: {
            ...state.optimizeState,
            quotaSyncStatus: "loading",
            quotaError: ""
        }
    }), label);
}

function setQuotaFailed(error, label) {
    store.setState((state) => ({
        optimizeState: {
            ...state.optimizeState,
            quotaSyncStatus: "failed",
            quotaError: getErrorMessage(error, "优化次数同步失败，请稍后重试")
        }
    }), label);
}

function applyQuotaToStore(quota) {
    const normalizedQuota = normalizeQuota(quota || store.getState().optimizeState);

    store.setState((state) => ({
        optimizeState: {
            ...state.optimizeState,
            grantedCount: normalizedQuota.grantedCount,
            usedCount: normalizedQuota.usedCount,
            reservedCount: normalizedQuota.reservedCount,
            quotaSyncStatus: "success",
            quotaError: "",
            lastQuotaSyncedAt: normalizedQuota.updatedAt
        }
    }), "applyOptimizeQuota");

    return normalizedQuota;
}

function applyReservationToStore(reservation, label) {
    if (!reservation || !reservation.reservationId) {
        return;
    }

    store.setState((state) => ({
        optimizeState: {
            ...state.optimizeState,
            reservationMap: {
                ...state.optimizeState.reservationMap,
                [reservation.reservationId]: reservation
            }
        }
    }), label);
}

function releaseLocalReservation(reservationId) {
    const reservation = store.getState().optimizeState.reservationMap[reservationId];

    if (!reservation || reservation.status !== "reserved") {
        return false;
    }

    store.setState((state) => ({
        optimizeState: {
            ...state.optimizeState,
            reservedCount: Math.max(0, state.optimizeState.reservedCount - 1),
            reservationMap: {
                ...state.optimizeState.reservationMap,
                [reservationId]: {
                    ...reservation,
                    status: "released"
                }
            }
        }
    }), "releaseLocalOptimizationReservation");

    return true;
}

async function syncOptimizeQuota(options = {}) {
    setQuotaLoading(options.silent === true, "syncOptimizeQuotaStart");

    try {
        const quota = await optimizationService.getOptimizeQuota();
        const normalizedQuota = applyQuotaToStore(quota);

        return {
            ok: true,
            quota: normalizedQuota
        };
    } catch (error) {
        setQuotaFailed(error, "syncOptimizeQuotaFailed");
        return {
            ok: false,
            error
        };
    }
}

async function grantOptimizeQuotaFromAd(payload = {}) {
    try {
        const result = await optimizationService.grantOptimizeQuota(payload);

        if (result && result.quota) {
            applyQuotaToStore(result.quota);
        }

        return {
            ok: true,
            ...(result || {})
        };
    } catch (error) {
        setQuotaFailed(error, "grantOptimizeQuotaFromAdFailed");
        return {
            ok: false,
            error
        };
    }
}

async function reserveOptimizationQuota(payload = {}) {
    try {
        const result = await optimizationService.reserveOptimizeQuota(payload);

        if (result && result.reservation) {
            applyReservationToStore(result.reservation, "reserveOptimizationQuotaReservation");
        }

        if (result && result.quota) {
            applyQuotaToStore(result.quota);
        }

        return result && result.reservation ? result.reservation : null;
    } catch (error) {
        setQuotaFailed(error, "reserveOptimizationQuotaFailed");
        throw error;
    }
}

async function releaseOptimizationReservation(reservationId) {
    if (!reservationId) {
        return {
            ok: true
        };
    }

    try {
        const result = await optimizationService.releaseOptimizeQuota(reservationId);

        if (result && result.reservation) {
            applyReservationToStore(result.reservation, "releaseOptimizationReservationRecord");
        }

        if (result && result.quota) {
            applyQuotaToStore(result.quota);
        }

        return {
            ok: true,
            ...(result || {})
        };
    } catch (error) {
        setQuotaFailed(error, "releaseOptimizationReservationFailed");
        const localReleased = releaseLocalReservation(reservationId);

        return {
            ok: false,
            localReleased,
            error
        };
    }
}

async function commitOptimizationReservation(reservationId, taskId) {
    if (!reservationId) {
        return {
            ok: true
        };
    }

    try {
        const result = await optimizationService.commitOptimizeQuota(reservationId, taskId);

        if (result && result.reservation) {
            applyReservationToStore(result.reservation, "commitOptimizationReservationRecord");
        }

        if (result && result.quota) {
            applyQuotaToStore(result.quota);
        }

        return {
            ok: true,
            ...(result || {})
        };
    } catch (error) {
        setQuotaFailed(error, "commitOptimizationReservationFailed");
        return {
            ok: false,
            error
        };
    }
}
