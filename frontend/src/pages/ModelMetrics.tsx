import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CircleDollarSign,
  Gauge,
  RefreshCw,
  Recycle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Cell,
  Pie,
  PieChart,
  Tooltip,
} from 'recharts'

/* ----------------------------- Types ----------------------------- */

type MetricValue = number | string | null | undefined

interface WasteThresholdMetrics {
  test_rows?: number
  selected_threshold?: number
  validation_metrics?: {
    precision?: number
    recall?: number
    f1_score?: number
  }
  test_regression_metrics?: {
    mae?: number
    rmse?: number
    r2?: number
    zero_baseline_mae?: number
    zero_baseline_rmse?: number
  }
  test_detection_metrics?: {
    precision?: number
    recall?: number
    f1_score?: number
    predicted_waste_cases?: number
    actual_waste_cases?: number
    confusion_matrix?: number[][]
  }
  note?: string
}

interface ModelReport {
  model?: string
  target?: string
  dataset_type?: string
  test_rows?: number
  train_rows?: number
  accuracy?: number
  precision?: number
  recall?: number
  f1_score?: number
  confusion_matrix?: number[][]
  roc_auc?: number
  mae?: number
  rmse?: number
  r2?: number
  zero_baseline_mae?: number
  zero_baseline_rmse?: number
  waste_threshold?: number
  test_start?: string
  test_end?: string
  warning?: string
  validation_note?: string
  note?: string
}

interface ModelMetricsResponse {
  status: string
  models: {
    food_waste?: ModelReport
    waste_threshold_evaluation?: WasteThresholdMetrics
    expiry_risk?: ModelReport
    discount?: ModelReport
  }
}

/* ---------------------------- Helpers ---------------------------- */

const isNumber = (value: MetricValue): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function numberValue(value: MetricValue, digits = 4): string {
  return isNumber(value) ? value.toFixed(digits) : 'N/A'
}

function percentage(value: MetricValue): string {
  return isNumber(value) ? `${(value * 100).toFixed(2)}%` : 'N/A'
}

interface ConfusionCounts {
  trueNegative: number
  falsePositive: number
  falseNegative: number
  truePositive: number
}

type MatrixDisplayMode = 'count' | 'percentage'

function getConfusionCounts(matrix?: number[][]): ConfusionCounts | null {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 2 ||
    matrix.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 2 ||
        row.some(
          (value) =>
            !Number.isInteger(value) || !Number.isFinite(value) || value < 0,
        ),
    )
  ) {
    return null
  }

  return {
    trueNegative: matrix[0][0],
    falsePositive: matrix[0][1],
    falseNegative: matrix[1][0],
    truePositive: matrix[1][1],
  }
}

function getBinaryMetrics(counts: ConfusionCounts | null) {
  if (!counts) {
    return {
      accuracy: undefined,
      precision: undefined,
      recall: undefined,
      f1Score: undefined,
    }
  }

  const { trueNegative, falsePositive, falseNegative, truePositive } = counts
  const total = trueNegative + falsePositive + falseNegative + truePositive
  const accuracy =
    total > 0 ? (trueNegative + truePositive) / total : undefined
  const precisionDenominator = truePositive + falsePositive
  const recallDenominator = truePositive + falseNegative
  const f1Denominator = 2 * truePositive + falsePositive + falseNegative

  return {
    accuracy,
    precision:
      precisionDenominator > 0
        ? truePositive / precisionDenominator
        : undefined,
    recall:
      recallDenominator > 0
        ? truePositive / recallDenominator
        : undefined,
    f1Score:
      f1Denominator > 0 ? (2 * truePositive) / f1Denominator : undefined,
  }
}

function formatMatrixPercentage(count: number, rowTotal: number): string {
  return rowTotal > 0 ? `${((count / rowTotal) * 100).toFixed(2)}%` : 'N/A'
}

function getWasteDetectionTotals(
  detection: WasteThresholdMetrics['test_detection_metrics'],
  testRows: number | undefined,
) {
  const counts = getConfusionCounts(detection?.confusion_matrix)
  if (
    !counts ||
    !isNumber(testRows) ||
    !Number.isInteger(testRows) ||
    testRows <= 0
  ) {
    return null
  }

  const { trueNegative, falsePositive, falseNegative, truePositive } = counts
  const matrixTotal = trueNegative + falsePositive + falseNegative + truePositive
  const predictedWasteCases = falsePositive + truePositive
  const actualWasteCases = falseNegative + truePositive

  if (
    matrixTotal !== testRows ||
    detection?.predicted_waste_cases !== predictedWasteCases ||
    detection?.actual_waste_cases !== actualWasteCases
  ) {
    return null
  }

  return {
    testRows,
    predictedWasteCases,
    actualWasteCases,
  }
}

/* --------------------------- Components -------------------------- */

function MetricCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description?: string
}) {
  return (
    <article className="metric-card">
      <span className="metric-card-icon" aria-hidden="true">
      <Activity size={20} aria-hidden="true" />
      </span>
      <p>{label}</p>
      <h2>{value}</h2>
      {description && <small>{description}</small>}
    </article>
  )
}

function ConfusionCell({
  label,
  count,
  rowTotal,
  tone,
  mode,
}: {
  label: string
  count: number
  rowTotal: number
  tone: 'correct' | 'incorrect'
  mode: MatrixDisplayMode
}) {
  return (
    <td
      className={`confusion-cell confusion-cell-${tone}`}
      title={`${label}: ${count.toLocaleString()} of ${rowTotal.toLocaleString()} actual cases`}
    >
      <span className="confusion-cell-label">{label}</span>
      <strong>
        {mode === 'count'
          ? count.toLocaleString('en-IN')
          : formatMatrixPercentage(count, rowTotal)}
      </strong>
      <small>
        {mode === 'count'
          ? formatMatrixPercentage(count, rowTotal)
          : `${count.toLocaleString('en-IN')} cases`}
      </small>
    </td>
  )
}

export default function ModelMetrics() {
  const [metrics, setMetrics] = useState<ModelMetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [matrixDisplayMode, setMatrixDisplayMode] =
    useState<MatrixDisplayMode>('count')

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/v1/models/metrics')

      if (!response.ok) {
        throw new Error(`Metrics API returned ${response.status}`)
      }

      const data: ModelMetricsResponse = await response.json()

      if (!data.models) {
        throw new Error('The API response does not contain model metrics.')
      }

      setMetrics(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load model metrics. Check the backend server.',
      )
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const waste = metrics?.models.food_waste
  const threshold = metrics?.models.waste_threshold_evaluation
  const detection = threshold?.test_detection_metrics
  const expiry = metrics?.models.expiry_risk
  const discount = metrics?.models.discount
  const confusionCounts = getConfusionCounts(expiry?.confusion_matrix)
  const binaryMetrics = getBinaryMetrics(confusionCounts)
  const wasteDetectionTotals = getWasteDetectionTotals(
    detection,
    threshold?.test_rows,
  )
  const wasteDetectionRadarData = [
    { metric: 'Precision', value: detection?.precision },
    { metric: 'Recall', value: detection?.recall },
    { metric: 'F1 Score', value: detection?.f1_score },
  ].map((item) => ({
    metric: item.metric,
    value: isNumber(item.value) ? item.value * 100 : null,
  }))
  const hasWasteDetectionRadarData = wasteDetectionRadarData.every(
    (item) => item.value !== null && item.value >= 0 && item.value <= 100,
  )
  const wasteCaseRings = wasteDetectionTotals
    ? [
        {
          label: 'Predicted waste cases',
          description: 'Predicted as positive',
          count: wasteDetectionTotals.predictedWasteCases,
          color: '#e5a33d',
          remainderLabel: 'Not predicted as waste',
        },
        {
          label: 'Actual waste cases',
          description: 'Actually positive',
          count: wasteDetectionTotals.actualWasteCases,
          color: '#238653',
          remainderLabel: 'Not actual waste',
        },
      ].map((item) => ({
        ...item,
        data: [
          { name: item.label, value: item.count },
          {
            name: item.remainderLabel,
            value: wasteDetectionTotals.testRows - item.count,
          },
        ],
      }))
    : []

  const wasteWorseThanBaseline =
    isNumber(waste?.mae) &&
    isNumber(waste?.zero_baseline_mae) &&
    waste.mae > waste.zero_baseline_mae

  return (
    <main className="page-content">
      {/* Header */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">MODEL MONITORING</span>
          <h1>Model Metrics</h1>
          <p>
            Review saved evaluation results for food waste, expiry risk, and
            discount models.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadMetrics()}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? 'Refreshing...' : 'Refresh metrics'}
        </button>
      </div>

      {/* Loading / error states */}
      {loading && <p>Loading model metrics...</p>}

      {!loading && error && (
        <div role="alert" className="panel">
          <AlertCircle size={20} />
          <p>Unable to load metrics: {error}</p>
          <button type="button" onClick={() => void loadMetrics()}>
            Try again
          </button>
        </div>
      )}

      {/* Metrics */}
      {!loading && metrics && (
        <>
          {/* Food waste regression */}
          <section className="panel">
            <h2>
            <Recycle size={20} aria-hidden="true" />
             Food Waste Prediction
            </h2>
            <p>
              Regression estimates the quantity of waste. Lower MAE and RMSE
              are generally better; R² indicates performance relative to a
              constant-mean baseline.
            </p>

            <div className="metrics-grid">
              <MetricCard
                label="Mean Absolute Error"
                value={numberValue(waste?.mae)}
                description="MAE"
              />
              <MetricCard
                label="Root Mean Squared Error"
                value={numberValue(waste?.rmse)}
                description="RMSE"
              />
              <MetricCard
                label="R² Score"
                value={numberValue(waste?.r2)}
                description="Negative means poor performance against the mean baseline."
              />
            </div>

            <div className="metrics-grid">
              <MetricCard
                label="Test Records"
                value={numberValue(waste?.test_rows, 0)}
              />
              <MetricCard
                label="Test Period"
                value={
                  waste?.test_start && waste?.test_end
                    ? `${waste.test_start} to ${waste.test_end}`
                    : 'N/A'
                }
              />
              <MetricCard
                label="Zero-Baseline MAE"
                value={numberValue(waste?.zero_baseline_mae)}
                description="Simple comparison baseline"
              />
            </div>

            {wasteWorseThanBaseline && (
              <div role="note" className="panel">
                <strong>Evaluation finding:</strong> The saved report's MAE is
                higher than the zero-prediction baseline MAE. The current
                waste regression model needs improvement.
              </div>
            )}
          </section>

          {/* Waste detection (classification) */}
          <section className="panel">
            <h2>
              <TrendingUp size={20} />
              Waste Detection Evaluation
            </h2>
            <p>
              These classification metrics use the separately evaluated
              threshold and test split. They are not regression scores.
            </p>

            <div className="metrics-grid">
              <MetricCard
                label="Detection Precision"
                value={percentage(detection?.precision)}
              />
              <MetricCard
                label="Detection Recall"
                value={percentage(detection?.recall)}
              />
              <MetricCard
                label="Detection F1 Score"
                value={percentage(detection?.f1_score)}
              />
              <MetricCard
                label="Selected Threshold"
                value={numberValue(threshold?.selected_threshold)}
              />
              <MetricCard
                label="Predicted Waste Cases"
                value={numberValue(detection?.predicted_waste_cases, 0)}
              />
              <MetricCard
                label="Actual Waste Cases"
                value={numberValue(detection?.actual_waste_cases, 0)}
              />
            </div>

            <section
              className="waste-evaluation-visuals"
              aria-label="Waste detection visual analysis"
            >
              <article className="waste-visual-card waste-radar-card">
                <div className="waste-visual-heading">
                  <div>
                    <span className="waste-visual-kicker">TEST METRICS</span>
                    <h3>Detection quality</h3>
                    <p>Precision, recall and F1 score on a 0–100% scale.</p>
                  </div>
                  <span className="waste-visual-icon">
                    <TrendingUp size={18} aria-hidden="true" />
                  </span>
                </div>
                {hasWasteDetectionRadarData ? (
                  <>
                    <div
                      className="waste-radar-chart"
                      role="img"
                      aria-label={`Radar chart with precision ${percentage(detection?.precision)}, recall ${percentage(detection?.recall)}, and F1 score ${percentage(detection?.f1_score)} on a zero to one hundred percent scale`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          data={wasteDetectionRadarData}
                          outerRadius="70%"
                        >
                          <PolarGrid stroke="#e5eee7" />
                          <PolarAngleAxis
                            dataKey="metric"
                            tick={{
                              fill: '#617469',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                          <PolarRadiusAxis
                            angle={30}
                            domain={[0, 100]}
                            tickCount={5}
                            tickFormatter={(value: number) => `${value}%`}
                            tick={{
                              fill: '#8b998e',
                              fontSize: 9,
                            }}
                          />
                          <Tooltip
                            formatter={(value) => [
                              `${Number(value).toFixed(2)}%`,
                              'Test score',
                            ]}
                            contentStyle={{
                              border: '1px solid #dce9df',
                              borderRadius: 10,
                              backgroundColor: 'rgba(255,255,255,.98)',
                              boxShadow: '0 10px 24px rgba(27,67,45,.12)',
                            }}
                          />
                          <Radar
                            name="Test score"
                            dataKey="value"
                            stroke="#176044"
                            strokeWidth={2.5}
                            fill="#55a76c"
                            fillOpacity={0.28}
                            activeDot={{
                              r: 5,
                              fill: '#e5a33d',
                              stroke: '#fff',
                              strokeWidth: 2,
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="waste-radar-legend">
                      <span>
                        <i />
                        Test-set score
                      </span>
                      <span>Scale: 0–100%</span>
                    </div>
                  </>
                ) : (
                  <div className="waste-visual-empty" role="status">
                    Complete percentage metrics are unavailable for this
                    chart.
                  </div>
                )}
              </article>

              <article className="waste-visual-card waste-cases-card">
                <div className="waste-visual-heading">
                  <div>
                    <span className="waste-visual-kicker">TEST CASES</span>
                    <h3>Waste case totals</h3>
                    <p>
                      Separate views of predicted and actual positive cases.
                    </p>
                  </div>
                  <span className="waste-visual-icon waste-visual-icon-orange">
                    <Recycle size={18} aria-hidden="true" />
                  </span>
                </div>
                {wasteCaseRings.length > 0 ? (
                  <>
                    <div className="waste-case-rings">
                      {wasteCaseRings.map((ring) => (
                        <div className="waste-case-ring" key={ring.label}>
                          <div
                            className="waste-case-donut"
                            role="img"
                            aria-label={`${ring.label}: ${ring.count} of ${wasteDetectionTotals?.testRows} test cases`}
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={ring.data}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius="68%"
                                  outerRadius="90%"
                                  startAngle={90}
                                  endAngle={-270}
                                  stroke="#ffffff"
                                  strokeWidth={2}
                                >
                                  <Cell fill={ring.color} />
                                  <Cell fill="#edf2ed" />
                                </Pie>
                                <Tooltip
                                  formatter={(value, name) => [
                                    `${Number(value).toLocaleString('en-IN')} cases (${formatMatrixPercentage(Number(value), wasteDetectionTotals?.testRows ?? 0)})`,
                                    name,
                                  ]}
                                  contentStyle={{
                                    border: '1px solid #dce9df',
                                    borderRadius: 10,
                                    backgroundColor: 'rgba(255,255,255,.98)',
                                    boxShadow: '0 10px 24px rgba(27,67,45,.12)',
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <span className="waste-case-ring-value">
                              {ring.count.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <strong>{ring.label}</strong>
                          <small>{ring.description}</small>
                        </div>
                      ))}
                    </div>
                    <p className="waste-case-disclaimer">
                      Each ring is measured against{' '}
                      {wasteDetectionTotals?.testRows.toLocaleString('en-IN')}{' '}
                      test rows. These totals overlap—true positives are
                      included in both—and are not mutually exclusive groups
                      or parts of one composition.
                    </p>
                  </>
                ) : (
                  <div className="waste-visual-empty" role="status">
                    Consistent test-set totals are unavailable for these
                    charts.
                  </div>
                )}
              </article>

              <article className="waste-visual-card waste-threshold-card">
                <div className="waste-visual-heading">
                  <div>
                    <span className="waste-visual-kicker">
                      VALIDATION-SELECTED
                    </span>
                    <h3>Decision threshold</h3>
                    <p>Chosen by maximizing validation F1 score.</p>
                  </div>
                  <span className="waste-visual-icon waste-visual-icon-orange">
                    <Gauge size={18} aria-hidden="true" />
                  </span>
                </div>
                <strong className="waste-threshold-value">
                  {numberValue(threshold?.selected_threshold, 4)}
                </strong>
                <div className="waste-threshold-note">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>
                    The evaluation does not define a fixed minimum or maximum
                    threshold range, so no gauge scale is shown.
                  </span>
                </div>
              </article>
            </section>

            <p>
              {threshold?.note ??
                'Threshold evaluation results are loaded from the saved report.'}
            </p>
          </section>

          {/* Expiry risk */}
          <section className="panel">
            <h2>
              <ShieldCheck size={20} />
              Expiry Risk Classification
            </h2>
            <p>
              Evaluation results from the saved classifier report. The
              original report uses a stratified random holdout.
            </p>

            <section className="confusion-matrix-panel" aria-labelledby="confusion-matrix-title">
              <div className="confusion-matrix-heading">
                <div>
                  <h3 id="confusion-matrix-title">Confusion Matrix</h3>
                  <p>
                    Test-set outcomes for {expiry?.target ?? 'the classifier'}.
                    Positive class: 1.
                  </p>
                </div>
                <div
                  className="confusion-matrix-toggle"
                  role="group"
                  aria-label="Confusion matrix display mode"
                >
                  <button
                    type="button"
                    aria-pressed={matrixDisplayMode === 'count'}
                    className={matrixDisplayMode === 'count' ? 'selected' : ''}
                    onClick={() => setMatrixDisplayMode('count')}
                  >
                    Count
                  </button>
                  <button
                    type="button"
                    aria-pressed={matrixDisplayMode === 'percentage'}
                    className={
                      matrixDisplayMode === 'percentage' ? 'selected' : ''
                    }
                    onClick={() => setMatrixDisplayMode('percentage')}
                  >
                    Percentage
                  </button>
                </div>
              </div>

              {confusionCounts ? (
                <>
                  <div className="confusion-matrix-chart">
                    <div className="confusion-matrix-predicted-label">
                      Predicted Label
                    </div>
                    <table
                      className="confusion-matrix-table"
                      aria-label={`Confusion matrix, ${matrixDisplayMode === 'count' ? 'counts and row percentages' : 'row-normalized percentages and counts'}`}
                    >
                      <thead>
                        <tr>
                          <th scope="col">Actual Label</th>
                          <th scope="col">Negative (0)</th>
                          <th scope="col">Positive (1)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row">Negative (0)</th>
                          <ConfusionCell
                            label="True Negative"
                            count={confusionCounts.trueNegative}
                            rowTotal={
                              confusionCounts.trueNegative +
                              confusionCounts.falsePositive
                            }
                            tone="correct"
                            mode={matrixDisplayMode}
                          />
                          <ConfusionCell
                            label="False Positive"
                            count={confusionCounts.falsePositive}
                            rowTotal={
                              confusionCounts.trueNegative +
                              confusionCounts.falsePositive
                            }
                            tone="incorrect"
                            mode={matrixDisplayMode}
                          />
                        </tr>
                        <tr>
                          <th scope="row">Positive (1)</th>
                          <ConfusionCell
                            label="False Negative"
                            count={confusionCounts.falseNegative}
                            rowTotal={
                              confusionCounts.falseNegative +
                              confusionCounts.truePositive
                            }
                            tone="incorrect"
                            mode={matrixDisplayMode}
                          />
                          <ConfusionCell
                            label="True Positive"
                            count={confusionCounts.truePositive}
                            rowTotal={
                              confusionCounts.falseNegative +
                              confusionCounts.truePositive
                            }
                            tone="correct"
                            mode={matrixDisplayMode}
                          />
                        </tr>
                      </tbody>
                    </table>
                    <div className="confusion-matrix-legend" aria-label="Matrix legend">
                      <span>
                        <i className="confusion-legend-correct" />
                        Correct predictions
                      </span>
                      <span>
                        <i className="confusion-legend-incorrect" />
                        Misclassifications
                      </span>
                    </div>
                  </div>

                  <div className="confusion-matrix-insight" role="note">
                    <strong>Key insight</strong>
                    <span>
                      Of {(
                        confusionCounts.falseNegative +
                        confusionCounts.truePositive
                      ).toLocaleString('en-IN')}{' '}
                      actual positive cases,{' '}
                      {confusionCounts.falseNegative.toLocaleString('en-IN')}{' '}
                      were missed;{' '}
                      {confusionCounts.falsePositive.toLocaleString('en-IN')}{' '}
                      negative cases were flagged as positive.
                    </span>
                  </div>
                </>
              ) : (
                <div className="confusion-matrix-empty" role="status">
                  Confusion matrix is unavailable or malformed in the saved
                  evaluation results.
                </div>
              )}
            </section>

            <div className="metrics-grid confusion-metrics-grid">
              <MetricCard
                label="Accuracy"
                value={percentage(binaryMetrics.accuracy)}
                description="Correct predictions across all test cases"
              />
              <MetricCard
                label="Precision"
                value={percentage(binaryMetrics.precision)}
                description="Positive class 1 · TP / (TP + FP)"
              />
              <MetricCard
                label="Recall"
                value={percentage(binaryMetrics.recall)}
                description="Positive class 1 · TP / (TP + FN)"
              />
              <MetricCard
                label="F1-score"
                value={percentage(binaryMetrics.f1Score)}
                description="Harmonic mean of precision and recall"
              />
            </div>

            <div className="metrics-grid">
              <MetricCard label="ROC-AUC" value={numberValue(expiry?.roc_auc)} />
              <MetricCard
                label="Test Records"
                value={numberValue(expiry?.test_rows, 0)}
              />
            </div>

            <p>
              {expiry?.validation_note ??
                'Validate performance on later real-world inventory batches before production use.'}
            </p>
          </section>

          {/* Discount model */}
          <section className="panel">
            <h2>
              <CircleDollarSign size={20} />
              Discount Model
            </h2>
            <p>
              Estimates gross margin from simulated discount scenarios.
              Results on simulated data do not establish real-world
              effectiveness.
            </p>

            <div className="metrics-grid">
              <MetricCard label="MAE" value={numberValue(discount?.mae)} />
              <MetricCard label="RMSE" value={numberValue(discount?.rmse)} />
              <MetricCard label="R² Score" value={numberValue(discount?.r2)} />
              <MetricCard
                label="Test Records"
                value={numberValue(discount?.test_rows, 0)}
              />
            </div>

            <p role="note">
              <AlertCircle size={16} />{' '}
              {discount?.warning ??
                'Evaluation uses simulated scenarios. Validate with real sales and margin data.'}
            </p>
          </section>
        </>
      )}
    </main>
  )
}