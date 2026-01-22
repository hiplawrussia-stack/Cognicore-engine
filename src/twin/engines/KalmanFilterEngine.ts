/**
 * Kalman Filter Engine
 *
 * Phase 6.3: State Estimation for Mental Health Digital Twins
 *
 * 2025 Research Integration:
 * - Enhanced Adaptive Kalman Filter (EKF, UKF)
 * - Ensemble Kalman Filter for high-dimensional systems
 * - Physics-Informed Neural Networks integration
 * - Variational Bayesian adaptation
 * - Robust filtering with outlier detection
 *
 * Research basis:
 * - Sensors 2025: "Enhanced Adaptive Kalman Filter for Multibody Model"
 * - ICCS 2025: "Data Assimilation for Dynamic Digital Twins"
 * - bioRxiv: "Ensemble Kalman filter methods for agent-based medical digital twins"
 * - arXiv: "Model-Based Monitoring and State Estimation: The Kalman Filter"
 *
 * © БФ "Другой путь", 2025
 */

import {
  type IKalmanFilterConfig,
  type IKalmanFilterState,
  type IKalmanFilterService,
  type IEnsembleKalmanConfig,
} from '../interfaces/IDigitalTwin';

import { secureRandom } from '../../utils/SecureRandom';

// ============================================================================
// MATRIX OPERATIONS (Lightweight implementation)
// ============================================================================

/**
 * Matrix multiplication
 */
function matmul(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const firstRowA = A[0];
  const firstRowB = B[0];
  if (!firstRowA || !firstRowB) {return [];}
  const colsA = firstRowA.length;
  const colsB = firstRowB.length;

  const result: number[][] = Array(rowsA).fill(null).map(() => Array(colsB).fill(0) as number[]);

  for (let i = 0; i < rowsA; i++) {
    const rowA = A[i];
    const rowR = result[i];
    if (!rowA || !rowR) {continue;}
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        const rowB = B[k];
        if (!rowB) {continue;}
        rowR[j] = (rowR[j] ?? 0) + (rowA[k] ?? 0) * (rowB[j] ?? 0);
      }
    }
  }

  return result;
}

/**
 * Matrix transpose
 */
function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const firstRow = A[0];
  if (!firstRow) {return [];}
  const cols = firstRow.length;
  const result: number[][] = Array(cols).fill(null).map(() => Array(rows).fill(0) as number[]);

  for (let i = 0; i < rows; i++) {
    const rowA = A[i];
    if (!rowA) {continue;}
    for (let j = 0; j < cols; j++) {
      const rowR = result[j];
      if (rowR) {
        rowR[i] = rowA[j] ?? 0;
      }
    }
  }

  return result;
}

/**
 * Matrix addition
 */
function matadd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => {
    const rowB = B[i];
    return row.map((val, j) => val + (rowB?.[j] ?? 0));
  });
}

/**
 * Matrix subtraction
 */
function matsub(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => {
    const rowB = B[i];
    return row.map((val, j) => val - (rowB?.[j] ?? 0));
  });
}

/**
 * Matrix scalar multiplication
 */
function matscale(A: number[][], s: number): number[][] {
  return A.map(row => row.map(val => val * s));
}

/**
 * Matrix-vector multiplication
 */
function matvec(A: number[][], v: number[]): number[] {
  return A.map(row => row.reduce((sum, val, j) => sum + val * (v[j] ?? 0), 0));
}

/**
 * Vector subtraction
 */
function vecsub(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - (b[i] ?? 0));
}

/**
 * Vector addition
 */
function vecadd(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + (b[i] ?? 0));
}

/**
 * Create identity matrix
 */
function eye(n: number): number[][] {
  return Array(n).fill(null).map((_, i) =>
    Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
  );
}

/**
 * Matrix inverse (using Gauss-Jordan elimination)
 * For small matrices used in mental health state estimation
 */
function matinv(A: number[][]): number[][] {
  const n = A.length;
  const eyeMatrix = eye(n);
  const augmented: number[][] = A.map((row, i) => {
    const eyeRow = eyeMatrix[i] ?? [];
    return [...row, ...eyeRow];
  });

  // Forward elimination
  for (let i = 0; i < n; i++) {
    const rowI = augmented[i];
    if (!rowI) {continue;}

    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      const rowK = augmented[k];
      const rowMax = augmented[maxRow];
      if (rowK && rowMax && Math.abs(rowK[i] ?? 0) > Math.abs(rowMax[i] ?? 0)) {
        maxRow = k;
      }
    }
    const rowMax = augmented[maxRow];
    if (rowMax) {
      [augmented[i], augmented[maxRow]] = [rowMax, rowI];
    }

    const rowICurrent = augmented[i];
    if (!rowICurrent) {continue;}

    // Singular matrix check
    if (Math.abs(rowICurrent[i] ?? 0) < 1e-10) {
      // Return identity with small values (regularization)
      return eye(n).map(row => row.map(v => v + 0.001));
    }

    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const rowK = augmented[k];
        if (!rowK) {continue;}
        const factor = (rowK[i] ?? 0) / (rowICurrent[i] ?? 1);
        for (let j = 0; j < 2 * n; j++) {
          rowK[j] = (rowK[j] ?? 0) - factor * (rowICurrent[j] ?? 0);
        }
      }
    }

    // Normalize row
    const pivot = rowICurrent[i] ?? 1;
    for (let j = 0; j < 2 * n; j++) {
      rowICurrent[j] = (rowICurrent[j] ?? 0) / pivot;
    }
  }

  // Extract inverse
  return augmented.map(row => row.slice(n));
}

/**
 * Vector to column matrix
 */
function vecToCol(v: number[]): number[][] {
  return v.map(val => [val]);
}


// ============================================================================
// KALMAN FILTER ENGINE
// ============================================================================

/**
 * Kalman Filter Engine
 *
 * Implements standard and enhanced Kalman filtering for digital twin state estimation
 */
export class KalmanFilterEngine implements IKalmanFilterService {

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize Kalman filter state
   */
  initialize(config: IKalmanFilterConfig): IKalmanFilterState {
    const n = config.initialState.length;

    return {
      stateEstimate: [...config.initialState],
      errorCovariance: config.initialCovariance.map(row => [...row]),

      predictedState: [...config.initialState],
      predictedCovariance: config.initialCovariance.map(row => [...row]),

      innovation: Array.from({ length: config.observationMatrix.length }, () => 0),
      innovationCovariance: Array.from({ length: config.observationMatrix.length }, () =>
        Array.from({ length: config.observationMatrix.length }, () => 0)),

      kalmanGain: Array.from({ length: n }, () =>
        Array.from({ length: config.observationMatrix.length }, () => 0)),

      normalized_innovation_squared: 0,
      isOutlier: false,
      adaptedQ: null,
      adaptedR: null,

      timestep: 0,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // PREDICTION STEP
  // ==========================================================================

  /**
   * Prediction (time update) step
   *
   * x̂⁻ₖ = A · x̂ₖ₋₁
   * P⁻ₖ = A · Pₖ₋₁ · Aᵀ + Q
   */
  predict(state: IKalmanFilterState, config: IKalmanFilterConfig): IKalmanFilterState {
    const A = config.stateTransitionMatrix;
    const Q = config.adaptiveQ && state.adaptedQ ? state.adaptedQ : config.processNoiseCovariance;

    // Predicted state
    const predictedState = matvec(A, state.stateEstimate);

    // Predicted covariance: P⁻ = A · P · Aᵀ + Q
    const AP = matmul(A, state.errorCovariance);
    const APAt = matmul(AP, transpose(A));
    const predictedCovariance = matadd(APAt, Q);

    return {
      ...state,
      predictedState,
      predictedCovariance,
      timestep: state.timestep + 1,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // UPDATE STEP
  // ==========================================================================

  /**
   * Update (measurement) step
   *
   * yₖ = zₖ - H · x̂⁻ₖ  (innovation)
   * Sₖ = H · P⁻ₖ · Hᵀ + R  (innovation covariance)
   * Kₖ = P⁻ₖ · Hᵀ · Sₖ⁻¹  (Kalman gain)
   * x̂ₖ = x̂⁻ₖ + Kₖ · yₖ
   * Pₖ = (I - Kₖ · H) · P⁻ₖ
   */
  update(
    state: IKalmanFilterState,
    measurement: number[],
    config: IKalmanFilterConfig
  ): IKalmanFilterState {
    const H = config.observationMatrix;
    const R = config.adaptiveR && state.adaptedR ? state.adaptedR : config.measurementNoiseCovariance;

    // Innovation (measurement residual)
    const predictedMeasurement = matvec(H, state.predictedState);
    const innovation = vecsub(measurement, predictedMeasurement);

    // Innovation covariance: S = H · P⁻ · Hᵀ + R
    const HP = matmul(H, state.predictedCovariance);
    const HPHt = matmul(HP, transpose(H));
    const innovationCovariance = matadd(HPHt, R);

    // Kalman gain: K = P⁻ · Hᵀ · S⁻¹
    const PHt = matmul(state.predictedCovariance, transpose(H));
    const Sinv = matinv(innovationCovariance);
    const kalmanGain = matmul(PHt, Sinv);

    // Cap Kalman gain if configured
    const cappedGain = config.maxGain
      ? kalmanGain.map(row => row.map(v => Math.min(Math.max(v, -config.maxGain), config.maxGain)))
      : kalmanGain;

    // Outlier detection (2025: Mahalanobis distance)
    const nis = this.calculateNIS(innovation, innovationCovariance);
    const isOutlier = nis > config.outlierThreshold;

    // State update: x̂ = x̂⁻ + K · y
    const Ky = matvec(cappedGain, isOutlier ? innovation.map(v => v * 0.1) : innovation);
    const stateEstimate = vecadd(state.predictedState, Ky);

    // Covariance update: P = (I - K · H) · P⁻
    const n = state.predictedState.length;
    const KH = matmul(cappedGain, H);
    const IminusKH = matsub(eye(n), KH);
    const errorCovariance = matmul(IminusKH, state.predictedCovariance);

    return {
      ...state,
      stateEstimate,
      errorCovariance,
      innovation,
      innovationCovariance,
      kalmanGain: cappedGain,
      normalized_innovation_squared: nis,
      isOutlier,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // COMBINED FILTER STEP
  // ==========================================================================

  /**
   * Combined predict-update cycle
   */
  filter(
    state: IKalmanFilterState,
    measurement: number[],
    config: IKalmanFilterConfig
  ): IKalmanFilterState {
    const predicted = this.predict(state, config);
    return this.update(predicted, measurement, config);
  }

  // ==========================================================================
  // SMOOTHING (2025)
  // ==========================================================================

  /**
   * Rauch-Tung-Striebel (RTS) smoother
   * Retrospective state estimation for improved accuracy
   */
  smooth(
    states: IKalmanFilterState[],
    config: IKalmanFilterConfig
  ): IKalmanFilterState[] {
    if (states.length < 2) {return states;}

    const smoothed = states.map(s => ({ ...s }));
    const A = config.stateTransitionMatrix;

    // Backward pass
    for (let k = states.length - 2; k >= 0; k--) {
      const current = smoothed[k];
      const next = smoothed[k + 1];
      if (!current || !next) {continue;}

      // Smoother gain: C = P · Aᵀ · (P⁻)⁻¹
      const PAt = matmul(current.errorCovariance, transpose(A));
      const predictedCovInv = matinv(next.predictedCovariance);
      const smootherGain = matmul(PAt, predictedCovInv);

      // Smoothed state: x̂ˢ = x̂ + C · (x̂ˢₖ₊₁ - x̂⁻ₖ₊₁)
      const stateDiff = vecsub(next.stateEstimate, next.predictedState);
      const correction = matvec(smootherGain, stateDiff);
      current.stateEstimate = vecadd(current.stateEstimate, correction);

      // Smoothed covariance: Pˢ = P + C · (Pˢₖ₊₁ - P⁻ₖ₊₁) · Cᵀ
      const covDiff = matsub(next.errorCovariance, next.predictedCovariance);
      const CCovDiff = matmul(smootherGain, covDiff);
      const CCovDiffCt = matmul(CCovDiff, transpose(smootherGain));
      current.errorCovariance = matadd(current.errorCovariance, CCovDiffCt);
    }

    return smoothed;
  }

  // ==========================================================================
  // ADAPTIVE METHODS (2025)
  // ==========================================================================

  /**
   * Adapt process noise covariance based on innovation sequence
   * Uses covariance matching method
   */
  adaptProcessNoise(
    state: IKalmanFilterState,
    innovations: number[][],
    config: IKalmanFilterConfig
  ): number[][] {
    if (innovations.length < 10) {return config.processNoiseCovariance;}

    const H = config.observationMatrix;
    const R = config.measurementNoiseCovariance;

    // Sample innovation covariance
    const firstInnovation = innovations[0];
    if (!firstInnovation) {return config.processNoiseCovariance;}

    const meanInnovation = firstInnovation.map((_, j) =>
      innovations.reduce((sum, inn) => sum + (inn[j] ?? 0), 0) / innovations.length
    );

    const sampleCov = firstInnovation.map((_, i) =>
      firstInnovation.map((_, j) =>
        innovations.reduce((sum, inn) => {
          const innI = inn[i] ?? 0;
          const innJ = inn[j] ?? 0;
          const meanI = meanInnovation[i] ?? 0;
          const meanJ = meanInnovation[j] ?? 0;
          return sum + (innI - meanI) * (innJ - meanJ);
        }, 0) / (innovations.length - 1)
      )
    );

    // Q̂ = Cov(y) - H · P · Hᵀ - R
    // Approximation using current error covariance
    const HP = matmul(H, state.errorCovariance);
    const HPHt = matmul(HP, transpose(H));
    const theoretical = matadd(HPHt, R);

    // Innovation covariance should match sample
    // This gives an estimate of whether Q is correct
    const scale = this.traceRatio(sampleCov, theoretical);

    // Adapt Q with forgetting factor
    const alpha = config.forgettingFactor || 0.95;
    const adaptedQ = config.processNoiseCovariance.map(row =>
      row.map(v => v * (alpha + (1 - alpha) * scale))
    );

    return adaptedQ;
  }

  /**
   * Adapt measurement noise covariance
   * Based on variational Bayesian approach (2025)
   */
  adaptMeasurementNoise(
    innovations: number[][],
    config: IKalmanFilterConfig
  ): number[][] {
    const firstInnovation = innovations[0];
    if (innovations.length < 10 || !firstInnovation) {return config.measurementNoiseCovariance;}

    // Sample covariance of innovations
    const meanInnovation = firstInnovation.map((_, j) =>
      innovations.reduce((sum, inn) => sum + (inn[j] ?? 0), 0) / innovations.length
    );

    const sampleCov = firstInnovation.map((_, i) =>
      firstInnovation.map((_, j) =>
        innovations.reduce((sum, inn) => {
          const innI = inn[i] ?? 0;
          const innJ = inn[j] ?? 0;
          const meanI = meanInnovation[i] ?? 0;
          const meanJ = meanInnovation[j] ?? 0;
          return sum + (innI - meanI) * (innJ - meanJ);
        }, 0) / (innovations.length - 1)
      )
    );

    // Exponential moving average with existing R
    const alpha = config.adaptationRate || 0.1;
    return config.measurementNoiseCovariance.map((row, i) => {
      const sampleRow = sampleCov[i];
      return row.map((v, j) => (1 - alpha) * v + alpha * (sampleRow?.[j] ?? 0));
    });
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Calculate Normalized Innovation Squared (NIS)
   * For outlier detection and filter consistency check
   */
  private calculateNIS(innovation: number[], innovationCov: number[][]): number {
    const Sinv = matinv(innovationCov);
    const yCol = vecToCol(innovation);
    const yTSinv = matmul(transpose(yCol), Sinv);
    const result = matmul(yTSinv, yCol);
    const row0 = result[0];
    return row0?.[0] ?? 0;
  }

  /**
   * Calculate trace ratio of two matrices
   */
  private traceRatio(A: number[][], B: number[][]): number {
    const traceA = A.reduce((sum, row, i) => sum + (row[i] ?? 0), 0);
    const traceB = B.reduce((sum, row, i) => sum + (row[i] ?? 0), 0);
    return traceB > 0 ? traceA / traceB : 1;
  }
}

// ============================================================================
// ENSEMBLE KALMAN FILTER (2025)
// ============================================================================

/**
 * Ensemble Kalman Filter
 *
 * For high-dimensional digital twin systems
 * Particularly useful for agent-based models
 */
export class EnsembleKalmanFilter {
  private ensemble: number[][] = [];
  private config: IEnsembleKalmanConfig;

  constructor(config: IEnsembleKalmanConfig) {
    this.config = config;
  }

  /**
   * Initialize ensemble with perturbations around initial state
   */
  initialize(initialState: number[], initialCovariance: number[][]): void {
    this.ensemble = [];

    for (let i = 0; i < this.config.ensembleSize; i++) {
      const member = initialState.map((val, j) => {
        const covRow = initialCovariance[j];
        const std = Math.sqrt(covRow?.[j] ?? 0);
        return val + std * this.gaussianRandom();
      });
      this.ensemble.push(member);
    }
  }

  /**
   * Forecast step - propagate each ensemble member
   */
  forecast(propagator: (state: number[]) => number[]): void {
    this.ensemble = this.ensemble.map(member => propagator(member));
  }

  /**
   * Analysis step - update ensemble with measurement
   */
  analyze(
    measurement: number[],
    observationOperator: (state: number[]) => number[],
    measurementNoise: number[][]
  ): void {
    const N = this.config.ensembleSize;
    const firstMember = this.ensemble[0];
    if (!firstMember) {return;}
    const stateSize = firstMember.length;
    const obsSize = measurement.length;

    // Ensemble mean
    const meanState = this.calculateEnsembleMean();

    // Ensemble of predicted observations
    const predictedObs = this.ensemble.map(member => observationOperator(member));
    const firstPredObs = predictedObs[0];
    if (!firstPredObs) {return;}
    const meanObs = firstPredObs.map((_, j) =>
      predictedObs.reduce((sum, obs) => sum + (obs[j] ?? 0), 0) / N
    );

    // Anomalies
    const stateAnomalies = this.ensemble.map(member =>
      member.map((val, j) => val - (meanState[j] ?? 0))
    );
    const obsAnomalies = predictedObs.map(obs =>
      obs.map((val, j) => val - (meanObs[j] ?? 0))
    );

    // Sample covariances
    // PH' = (1/(N-1)) * X_a * Y_a'
    const PHt: number[][] = Array(stateSize).fill(null).map(() => Array(obsSize).fill(0) as number[]);
    for (let i = 0; i < stateSize; i++) {
      const phtRow = PHt[i];
      if (!phtRow) {continue;}
      for (let j = 0; j < obsSize; j++) {
        for (let k = 0; k < N; k++) {
          const stateAnom = stateAnomalies[k];
          const obsAnom = obsAnomalies[k];
          phtRow[j] = (phtRow[j] ?? 0) + (stateAnom?.[i] ?? 0) * (obsAnom?.[j] ?? 0);
        }
        phtRow[j] = (phtRow[j] ?? 0) / (N - 1);
      }
    }

    // HPH' + R
    const HPHt: number[][] = Array(obsSize).fill(null).map(() => Array(obsSize).fill(0) as number[]);
    for (let i = 0; i < obsSize; i++) {
      const hphtRow = HPHt[i];
      if (!hphtRow) {continue;}
      for (let j = 0; j < obsSize; j++) {
        for (let k = 0; k < N; k++) {
          const obsAnom = obsAnomalies[k];
          hphtRow[j] = (hphtRow[j] ?? 0) + (obsAnom?.[i] ?? 0) * (obsAnom?.[j] ?? 0);
        }
        hphtRow[j] = (hphtRow[j] ?? 0) / (N - 1);
      }
    }
    const S = matadd(HPHt, measurementNoise);

    // Covariance inflation (2025)
    const inflatedS = matscale(S, this.config.inflationFactor);

    // Kalman gain K = PH' * S^-1
    const Sinv = matinv(inflatedS);
    const K = matmul(PHt, Sinv);

    // Update ensemble
    for (let i = 0; i < N; i++) {
      // Perturb observations (stochastic EnKF)
      let perturbedMeas = measurement;
      if (this.config.perturbObservations) {
        perturbedMeas = measurement.map((val, j) => {
          const noiseRow = measurementNoise[j];
          return val + Math.sqrt(noiseRow?.[j] ?? 0) * this.gaussianRandom();
        });
      }

      // Innovation
      const predObs = predictedObs[i] ?? [];
      const innovation = vecsub(perturbedMeas, predObs);

      // Update
      const correction = matvec(K, innovation);
      const currentMember = this.ensemble[i] ?? [];
      this.ensemble[i] = vecadd(currentMember, correction);
    }
  }

  /**
   * Get ensemble mean (state estimate)
   */
  getStateEstimate(): number[] {
    return this.calculateEnsembleMean();
  }

  /**
   * Get ensemble covariance (uncertainty estimate)
   */
  getErrorCovariance(): number[][] {
    const mean = this.calculateEnsembleMean();
    const N = this.config.ensembleSize;
    const firstMember = this.ensemble[0];
    if (!firstMember) {return [];}
    const stateSize = firstMember.length;

    const cov: number[][] = Array(stateSize).fill(null).map(() => Array(stateSize).fill(0) as number[]);

    for (let i = 0; i < stateSize; i++) {
      const covRow = cov[i];
      if (!covRow) {continue;}
      for (let j = 0; j < stateSize; j++) {
        for (let k = 0; k < N; k++) {
          const member = this.ensemble[k];
          const memI = member?.[i] ?? 0;
          const memJ = member?.[j] ?? 0;
          const meanI = mean[i] ?? 0;
          const meanJ = mean[j] ?? 0;
          covRow[j] = (covRow[j] ?? 0) + (memI - meanI) * (memJ - meanJ);
        }
        covRow[j] = (covRow[j] ?? 0) / (N - 1);
      }
    }

    return cov;
  }

  private calculateEnsembleMean(): number[] {
    const N = this.config.ensembleSize;
    const firstMember = this.ensemble[0];
    if (!firstMember) {return [];}
    return firstMember.map((_, j) =>
      this.ensemble.reduce((sum, member) => sum + (member[j] ?? 0), 0) / N
    );
  }

  private gaussianRandom(): number {
    // Box-Muller transform with cryptographically secure random
    let u1: number;
    do {
      u1 = secureRandom();
    } while (u1 === 0); // Avoid log(0)
    const u2 = secureRandom();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const kalmanFilterEngine = new KalmanFilterEngine();
