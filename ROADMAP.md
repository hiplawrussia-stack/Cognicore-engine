# CogniCore Engine 2.0 Roadmap
## Стратегический план развития 2025-2027

> Документ создан на основе анализа 80+ научных источников 2024-2025 годов из arXiv, Nature, JMIR, Frontiers, PMC, IEEE, Springer, medRxiv, bioRxiv.

---

## Executive Summary

Данный roadmap определяет трансформацию CogniCore Engine из текущего состояния (v1.x) в прорывную платформу цифровой терапевтики мирового уровня (v2.0).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COGNICORE ENGINE EVOLUTION                        │
├─────────────────────────────────────────────────────────────────────────┤
│  v1.x (Current)          v1.5 (Bridge)           v2.0 (Target)          │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐        │
│  │ Linear POMDP│   ──►   │Hybrid Core  │   ──►   │ Full Stack  │        │
│  │ Rule-based  │         │PLRNN+Kalman │         │ GAMBITTS    │        │
│  │ Single-node │         │Voice Input  │         │ Federated   │        │
│  └─────────────┘         └─────────────┘         └─────────────┘        │
│       Q1 2025                Q3 2025                 Q4 2026            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: Foundation Upgrade (Q1-Q2 2025)
### "Nonlinear Core"

**Цель:** Устранить Linear-Gaussian Trap, добавить multimodal input

### 1.1 PLRNN Integration (8 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 1.1.1 | Исследование [DurstewitzLab/dendPLRNN](https://github.com/DurstewitzLab/dendPLRNN) | Technical specification |
| 1.1.2 | Порт PLRNN на TypeScript/ONNX.js | `src/temporal/PLRNNEngine.ts` |
| 1.1.3 | Гибридный Belief Update | `BeliefUpdateEngine.predictHybrid()` |
| 1.1.4 | Валидация на синтетических данных | Benchmark report |

**Архитектура:**
```typescript
// src/temporal/PLRNNEngine.ts
interface IPLRNNConfig {
  latentDim: number;           // 5D state vector
  hiddenUnits: number;         // piecewise-linear units
  connectivity: 'sparse' | 'full';
}

class PLRNNEngine {
  // Piecewise-linear dynamics
  forward(state: StateVector, dt: number): StateVector;

  // Interpretable network extraction
  extractPsychologicalNetwork(): CausalGraph;

  // Integration with Kalman for short-term
  hybridPredict(state: StateVector, horizon: 'short' | 'long'): Prediction;
}
```

**Научное обоснование:** [medRxiv 2025](https://www.medrxiv.org/content/10.1101/2025.07.03.25330825v1.full) — PLRNNs outperform Transformers и VAR для EMA forecasting

---

### 1.2 KalmanFormer Hybrid (6 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 1.2.1 | Имплементация Transformer-based Kalman Gain | `src/belief/KalmanFormer.ts` |
| 1.2.2 | Ensemble: Kalman (short-term) + Transformer (long-range) | `BeliefUpdateEngine.v2` |
| 1.2.3 | A/B тестирование vs legacy Kalman | Comparison report |

**Научное обоснование:** [KalmanFormer (Frontiers, 2024)](https://www.frontiersin.org/journals/neurorobotics/articles/10.3389/fnbot.2024.1460255/full)

---

### 1.3 Voice Input Adapter (6 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 1.3.1 | Whisper API интеграция | `src/input/VoiceTranscriber.ts` |
| 1.3.2 | Acoustic feature extraction (F0, jitter, shimmer) | `src/input/AcousticAnalyzer.ts` |
| 1.3.3 | Prosody → Emotional state mapping | `src/input/ProsodyMapper.ts` |
| 1.3.4 | Multimodal fusion (text + voice) | `src/input/MultimodalFusion.ts` |

**Архитектура:**
```typescript
// src/input/VoiceInputAdapter.ts
interface IVoiceAnalysis {
  transcription: string;
  acoustic: {
    f0Mean: number;
    f0Variance: number;
    jitter: number;
    shimmer: number;
    speechRate: number;
  };
  prosody: {
    emotionalValence: number;  // -1 to 1
    arousal: number;           // 0 to 1
    dominance: number;         // 0 to 1
  };
  confidence: number;
}

class VoiceInputAdapter {
  async analyze(audioBuffer: ArrayBuffer): Promise<IVoiceAnalysis>;

  // Fusion with text analysis
  fuseWithText(voice: IVoiceAnalysis, text: ITextAnalysis): IMultimodalState;
}
```

**Научное обоснование:** [Voice of Mind (2025)](https://www.sciencedirect.com/science/article/abs/pii/S0892199725003789) — AUC 0.71-0.93

---

### Phase 1 Timeline

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 1 TIMELINE                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Week:  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20  │
│        ├─────────────────┤                                           │
│ 1.1    │    PLRNN Core   │                                           │
│        └─────────────────┘                                           │
│              ├───────────────┤                                       │
│ 1.2          │ KalmanFormer  │                                       │
│              └───────────────┘                                       │
│                       ├───────────────┤                              │
│ 1.3                   │  Voice Input  │                              │
│                       └───────────────┘                              │
│                                        ▼                             │
│                                   [v1.5 Release]                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Критерии успеха Phase 1:**
- [ ] PLRNN forecasting accuracy > Kalman на 15%+
- [ ] Voice analysis latency < 500ms
- [ ] Multimodal fusion operational

---

## PHASE 2: Generative Layer (Q3-Q4 2025)
### "GAMBITTS Integration"

**Цель:** Персонализированная генерация терапевтических интервенций

### 2.1 GAMBITTS Framework (10 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 2.1.1 | Two-stage architecture design | Architecture document |
| 2.1.2 | Action selection (Thompson Sampling backbone) | `src/generative/ActionSelector.ts` |
| 2.1.3 | LLM generation layer (Claude/GPT API) | `src/generative/LLMGenerator.ts` |
| 2.1.4 | Reward modeling | `src/generative/RewardModel.ts` |
| 2.1.5 | poGAMBITTS (offline pretraining) | `src/generative/OfflineTrainer.ts` |

**Архитектура:**
```typescript
// src/generative/GAMBITTSEngine.ts
interface IGAMBITTSConfig {
  actionSpace: TherapeuticAction[];     // CBT, DBT, ACT, MI, Mindfulness
  llmProvider: 'anthropic' | 'openai';
  constitutionalRules: IConstitution;
  explorationRate: number;              // Thompson Sampling параметр
}

class GAMBITTSEngine {
  // Stage 1: Action selection via Thompson Sampling
  selectAction(context: IUserContext): TherapeuticAction;

  // Stage 2: LLM-mediated content generation
  generateIntervention(action: TherapeuticAction, context: IUserContext): Promise<string>;

  // Stage 3: Reward update
  updateReward(interventionId: string, outcome: IOutcome): void;

  // Regret bounds: Õ(d^{3/2}√T)
  getRegretBound(): number;
}
```

**Научное обоснование:** [GAMBITTS (arXiv, май 2025)](https://arxiv.org/html/2505.16311)

---

### 2.2 Constitutional AI Layer (6 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 2.2.1 | Domain-specific constitution design | Constitution document |
| 2.2.2 | Pre-generation filter | `src/safety/ConstitutionalPreFilter.ts` |
| 2.2.3 | Post-generation validator | `src/safety/ConstitutionalValidator.ts` |
| 2.2.4 | Human escalation triggers | `src/safety/EscalationTrigger.ts` |

**Constitution Rules:**
```typescript
// src/safety/TherapeuticConstitution.ts
const THERAPEUTIC_CONSTITUTION: IConstitutionalRule[] = [
  // NEVER rules (hard constraints)
  { type: 'NEVER', rule: 'Provide medical diagnoses' },
  { type: 'NEVER', rule: 'Discourage seeking professional help' },
  { type: 'NEVER', rule: 'Discuss methods of self-harm' },
  { type: 'NEVER', rule: 'Promise cure or recovery timeline' },
  { type: 'NEVER', rule: 'Share other users data or experiences' },

  // ALWAYS rules (positive constraints)
  { type: 'ALWAYS', rule: 'Validate emotions before suggesting techniques' },
  { type: 'ALWAYS', rule: 'Use evidence-based CBT/DBT/ACT techniques' },
  { type: 'ALWAYS', rule: 'Escalate to human at crisis signals' },
  { type: 'ALWAYS', rule: 'Explain reasoning transparently' },
  { type: 'ALWAYS', rule: 'Respect user autonomy in choices' },

  // PREFER rules (soft constraints)
  { type: 'PREFER', rule: 'Shorter responses for high-anxiety states' },
  { type: 'PREFER', rule: 'Open questions over advice' },
  { type: 'PREFER', rule: 'Metaphors appropriate to user age group' },
];
```

**Регуляторное соответствие:**
- [New York AI Companion Law (май 2025)](https://mental.jmir.org/2025/1/e80739)
- [Illinois WOPR Act (август 2025)](https://mental.jmir.org/2025/1/e80739)

---

### 2.3 RAG Pipeline для Evidence-Based Content (4 недели)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 2.3.1 | Vector database setup (Pinecone/Qdrant) | Infrastructure |
| 2.3.2 | CBT/DBT/ACT/MI protocol embedding | `data/therapeutic_protocols.jsonl` |
| 2.3.3 | Retrieval integration with LLM | `src/generative/RAGRetriever.ts` |
| 2.3.4 | Citation injection | Response includes source references |

**Архитектура:**
```typescript
// src/generative/RAGRetriever.ts
class TherapeuticRAG {
  // Index therapeutic protocols
  indexProtocol(protocol: ITherapeuticProtocol): void;

  // Retrieve relevant techniques for context
  retrieve(context: IUserContext, action: TherapeuticAction): IRelevantTechniques[];

  // Ground LLM generation in evidence
  groundGeneration(prompt: string, techniques: IRelevantTechniques[]): string;
}
```

---

### Phase 2 Timeline

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 2 TIMELINE                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Week: 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40   │
│       ├────────────────────────────────────┤                         │
│ 2.1   │         GAMBITTS Framework         │                         │
│       └────────────────────────────────────┘                         │
│                    ├─────────────────────┤                           │
│ 2.2                │  Constitutional AI  │                           │
│                    └─────────────────────┘                           │
│                                   ├──────────────┤                   │
│ 2.3                               │  RAG Pipeline │                  │
│                                   └──────────────┘                   │
│                                                   ▼                  │
│                                              [v1.7 Release]          │
└──────────────────────────────────────────────────────────────────────┘
```

**Критерии успеха Phase 2:**
- [ ] LLM-generated interventions pass Constitutional AI 100%
- [ ] User satisfaction > rule-based на 20%+
- [ ] Zero safety incidents in pilot
- [ ] RAG retrieval accuracy > 90%

---

## PHASE 3: Privacy Infrastructure (Q1-Q2 2026)
### "Federated Scale"

**Цель:** Privacy-preserving distributed learning

### 3.1 Federated Learning Core (12 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 3.1.1 | On-device training architecture | `src/federated/OnDeviceTrainer.ts` |
| 3.1.2 | LoRA adapter implementation | `src/federated/LoRAAdapter.ts` |
| 3.1.3 | Gradient aggregation server | `server/FederatedAggregator.ts` |
| 3.1.4 | Differential Privacy budgets | `src/federated/DPBudget.ts` |
| 3.1.5 | FedAvg implementation | `src/federated/FedAvg.ts` |

**Архитектура:**
```typescript
// src/federated/FederatedCore.ts
interface IFederatedConfig {
  privacyBudget: {
    epsilon: number;           // DP epsilon
    delta: number;             // DP delta
    domainAware: boolean;      // FedMentor-style domain budgets
  };
  aggregation: 'fedAvg' | 'fedProx' | 'scaffold';
  loraRank: 8 | 16 | 32;       // LoRA adapter rank
  localEpochs: number;
  minParticipants: number;
}

class FederatedLearningCore {
  // Train locally, share gradients only
  trainLocal(userState: IUserState, reward: number): IGradient;

  // Aggregate with differential privacy
  aggregateGradients(gradients: IGradient[]): IModelUpdate;

  // Update global model
  updateGlobalModel(update: IModelUpdate): void;

  // Privacy budget tracking
  getRemainingBudget(userId: string): number;
}
```

**Научное обоснование:**
- [FedMentor (arXiv, 2025)](https://arxiv.org/html/2509.14275v1) — Domain-aware DP
- [FedMentalCare (arXiv, 2025)](https://arxiv.org/abs/2503.05786) — FL + LoRA

---

### 3.2 On-Device Inference (6 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 3.2.1 | Model quantization (4-bit) | `src/federated/Quantizer.ts` |
| 3.2.2 | ONNX.js runtime optimization | Performance benchmark |
| 3.2.3 | Edge caching strategy | `src/federated/EdgeCache.ts` |
| 3.2.4 | Bandwidth optimization | < 100KB per sync |

---

### 3.3 Compliance & Audit (4 недели)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 3.3.1 | HIPAA compliance checklist | Compliance document |
| 3.3.2 | GDPR compliance checklist | Compliance document |
| 3.3.3 | Audit logging | `src/federated/AuditLogger.ts` |
| 3.3.4 | Data lineage tracking | `src/federated/DataLineage.ts` |

---

### Phase 3 Timeline

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 3 TIMELINE                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Week: 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60   │
│       ├─────────────────────────────────────────────┤                │
│ 3.1   │            Federated Learning Core          │                │
│       └─────────────────────────────────────────────┘                │
│                              ├─────────────────────┤                 │
│ 3.2                          │  On-Device Inference │                │
│                              └─────────────────────┘                 │
│                                          ├────────────────┤          │
│ 3.3                                      │ Compliance Audit│         │
│                                          └────────────────┘          │
│                                                          ▼           │
│                                                     [v1.9 Release]   │
└──────────────────────────────────────────────────────────────────────┘
```

**Критерии успеха Phase 3:**
- [ ] Reidentification accuracy < 50%
- [ ] Model accuracy degradation < 5% vs centralized
- [ ] HIPAA/GDPR compliance certified
- [ ] 1000+ devices in federated network

---

## PHASE 4: Foundation Model Integration (Q3-Q4 2026)
### "Multimodal Intelligence"

**Цель:** Интеграция pretrained foundation models

### 4.1 PAT Integration (8 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 4.1.1 | [Pretrained Actigraphy Transformer](https://github.com/njacobsonlab/Pretrained-Actigraphy-Transformer/) integration | `src/foundation/PATAdapter.ts` |
| 4.1.2 | Wearable data preprocessing | `src/input/WearablePreprocessor.ts` |
| 4.1.3 | PAT → State Vector enrichment | Enhanced 5D+ state |
| 4.1.4 | Fine-tuning pipeline | Domain-specific adaptation |

**Архитектура:**
```typescript
// src/foundation/PATAdapter.ts
class PATAdapter {
  // Load pretrained model (2M params)
  loadPretrained(): void;

  // Process actigraphy data
  processActigraphy(data: IActigraphyData): IMovementEmbedding;

  // Enrich state vector with movement patterns
  enrichState(state: StateVector, embedding: IMovementEmbedding): EnrichedStateVector;

  // Explainability
  getAttentionWeights(): IAttentionMap;
}
```

**Научное обоснование:** [PAT (arXiv, ноябрь 2024)](https://arxiv.org/abs/2411.15240) — SOTA для mental health prediction

---

### 4.2 Multimodal Fusion Engine (6 недель)

| Задача | Описание | Deliverable |
|--------|----------|-------------|
| 4.2.1 | Cross-modal attention | `src/foundation/CrossModalAttention.ts` |
| 4.2.2 | Missing modality handling | Robust inference |
| 4.2.3 | Modality weighting | Context-dependent fusion |
| 4.2.4 | Late fusion architecture | `src/foundation/LateFusion.ts` |

**Поддерживаемые модальности:**
```typescript
interface IMultimodalInput {
  text?: ITextAnalysis;           // Messages, EMA
  voice?: IVoiceAnalysis;         // Prosody, acoustics
  actigraphy?: IMovementData;     // Wearables (PAT)
  passive?: IDigitalPhenotype;    // Phone usage patterns
  physiological?: IPhysioData;    // HRV, sleep stages
}
```

---

### Phase 4 Milestones

**Критерии успеха Phase 4:**
- [ ] Multimodal accuracy > unimodal на 10%+
- [ ] Missing modality robustness: < 5% accuracy drop
- [ ] PAT fine-tuning completed
- [ ] Real-time inference < 200ms

---

## PHASE 5: Production Hardening (Q1 2027)
### "Clinical Ready"

### 5.1 Clinical Validation

| Задача | Описание |
|--------|----------|
| 5.1.1 | IRB approval for pilot study |
| 5.1.2 | N=100 pilot study design |
| 5.1.3 | PHQ-9/GAD-7 outcome tracking |
| 5.1.4 | Safety monitoring protocol |

### 5.2 Regulatory Preparation

| Задача | Описание |
|--------|----------|
| 5.2.1 | FDA Pre-Submission meeting |
| 5.2.2 | 510(k) or De Novo pathway determination |
| 5.2.3 | EU MDR / DiGA preparation |
| 5.2.4 | Model Card documentation |

### 5.3 Explainability Dashboard

| Задача | Описание |
|--------|----------|
| 5.3.1 | [RiskPath](https://healthcare.utah.edu/press-releases/2025/04/university-of-utah-researchers-develop-explainable-ai-toolkit-predict) integration |
| 5.3.2 | SHAP/LIME visualizations |
| 5.3.3 | Clinician-facing explanations |
| 5.3.4 | Patient-facing narratives |

---

## Master Timeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        COGNICORE 2.0 MASTER TIMELINE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ 2025                           2026                           2027              │
│ Q1    Q2    Q3    Q4          Q1    Q2    Q3    Q4          Q1                  │
│ ├─────┼─────┼─────┼───────────┼─────┼─────┼─────┼───────────┼─────┤             │
│                                                                                  │
│ ██████████████                                                                   │
│ PHASE 1: Nonlinear Core                                                          │
│ • PLRNN                                                                          │
│ • KalmanFormer                                                                   │
│ • Voice Input                                                                    │
│         ▼ v1.5                                                                   │
│                                                                                  │
│       ████████████████                                                           │
│       PHASE 2: Generative Layer                                                  │
│       • GAMBITTS                                                                 │
│       • Constitutional AI                                                        │
│       • RAG Pipeline                                                             │
│                 ▼ v1.7                                                           │
│                                                                                  │
│                   ██████████████████                                             │
│                   PHASE 3: Federated Scale                                       │
│                   • FL Core                                                      │
│                   • On-Device Inference                                          │
│                   • Compliance                                                   │
│                              ▼ v1.9                                              │
│                                                                                  │
│                                    ████████████████                              │
│                                    PHASE 4: Foundation Models                    │
│                                    • PAT Integration                             │
│                                    • Multimodal Fusion                           │
│                                                ▼ v2.0-beta                       │
│                                                                                  │
│                                                      ██████████                  │
│                                                      PHASE 5: Clinical           │
│                                                      • Validation                │
│                                                      • Regulatory                │
│                                                               ▼ v2.0             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Риски и Митигации

| Риск | Вероятность | Импакт | Митигация |
|------|-------------|--------|-----------|
| LLM hallucinations | Высокая | Критический | Constitutional AI + RAG grounding |
| FL convergence issues | Средняя | Высокий | FedProx + adaptive learning rates |
| Regulatory rejection | Средняя | Критический | Early FDA Pre-Sub, White Box advantage |
| PLRNN training instability | Низкая | Средний | Teacher forcing + SVAE |
| Privacy breach | Низкая | Критический | DP + on-device processing |

---

## Ресурсные требования

### Команда

| Роль | FTE | Фазы |
|------|-----|------|
| ML Engineer (Temporal) | 1.0 | 1, 4 |
| ML Engineer (NLP/LLM) | 1.0 | 2, 3 |
| Backend Engineer | 1.0 | 1-5 |
| Mobile/Edge Engineer | 0.5 | 3, 4 |
| Clinical Advisor | 0.25 | 2, 5 |
| Regulatory Specialist | 0.25 | 5 |

### Инфраструктура

| Компонент | Стоимость/мес | Фазы |
|-----------|---------------|------|
| Claude API | $500-2000 | 2+ |
| Vector DB (Pinecone) | $70-200 | 2+ |
| FL Aggregation Server | $200-500 | 3+ |
| GPU Training (periodic) | $500-1000 | 1, 3, 4 |

---

## KPIs по фазам

| Фаза | Метрика | Target |
|------|---------|--------|
| 1 | Forecasting accuracy (vs Kalman) | +15% |
| 1 | Voice latency | < 500ms |
| 2 | User satisfaction (vs rule-based) | +20% |
| 2 | Constitutional pass rate | 100% |
| 3 | Reidentification accuracy | < 50% |
| 3 | FL participants | 1000+ |
| 4 | Multimodal vs unimodal accuracy | +10% |
| 5 | Clinical outcome (PHQ-9 change) | Significant |

---

## Научные источники

### POMDP / Computational Psychiatry
- [Active Inference + POMDP (PMC, 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11674655/)

### Digital Twins
- [Nature Mental Health (2025)](https://www.nature.com/articles/s44220-025-00526-z)
- [Frontiers in Psychiatry (2025)](https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2025.1572444/full)

### GAMBITTS / LLM Interventions
- [GAMBITTS (arXiv, 2025)](https://arxiv.org/html/2505.16311)

### Federated Learning
- [FedMentor (arXiv, 2025)](https://arxiv.org/html/2509.14275v1)
- [FedMentalCare (arXiv, 2025)](https://arxiv.org/abs/2503.05786)

### Voice Biomarkers
- [Voice of Mind (2025)](https://www.sciencedirect.com/science/article/abs/pii/S0892199725003789)
- [JMIR Speech Analysis (2024)](https://www.jmir.org/2024/1/e58572)

### PLRNN / Nonlinear Dynamics
- [PLRNN for Mental Health (medRxiv, 2025)](https://www.medrxiv.org/content/10.1101/2025.07.03.25330825v1.full)
- [DurstewitzLab dendPLRNN](https://github.com/DurstewitzLab/dendPLRNN)

### KalmanFormer
- [KalmanFormer (Frontiers, 2024)](https://www.frontiersin.org/journals/neurorobotics/articles/10.3389/fnbot.2024.1460255/full)

### Foundation Models
- [Pretrained Actigraphy Transformer (arXiv, 2024)](https://arxiv.org/abs/2411.15240)
- [GitHub: PAT](https://github.com/njacobsonlab/Pretrained-Actigraphy-Transformer/)

### Regulatory
- [FDA DTx Approvals 2024](https://bgoventures.com/top-6-digital-therapeutics-dtx-approved-by-the-fda-in-2024-and-what-they-mean-for-patient-care/)
- [State AI Mental Health Laws (JMIR, 2025)](https://mental.jmir.org/2025/1/e80739)

### Explainability
- [RiskPath XAI Toolkit (Utah, 2025)](https://healthcare.utah.edu/press-releases/2025/04/university-of-utah-researchers-develop-explainable-ai-toolkit-predict)

---

## Версионирование

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 1.0 | 2024-12-28 | БФ "Другой путь" | Initial roadmap based on 80+ sources research |

---

**© 2025 Благотворительный фонд "Другой путь"**
**CogniCore Engine | awfond.ru**
