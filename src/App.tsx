import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { formatCommandPreview, generatePosixScript } from './lib/script'
import { isLocallyRunnable } from './lib/commandPolicy'
import { CATEGORY_LABELS, isPrimaryGovernanceCommand, loadSpec } from './lib/spec'
import { STARTER_GROUPS } from './lib/starterGroups'
import type { CommandDef, GroupConfig, ParamBinding, PassCliSpec, StepConfig } from './lib/types'
import { SAFE_BIND_PATHS } from './lib/types'

type LoadState = 'loading' | 'ready' | 'error'

function newStep(commandId: string): StepConfig {
  return {
    id: `step-${crypto.randomUUID().slice(0, 8)}`,
    commandId,
    flagValues: {},
    positionalValues: {},
  }
}

function App() {
  const [spec, setSpec] = useState<PassCliSpec | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cliVersion, setCliVersion] = useState<{ available: boolean; version?: string } | null>(null)
  const [group, setGroup] = useState<GroupConfig>(() => ({
    id: 'custom',
    name: 'Groupe personnalisé',
    description: 'Composez des commandes pass-cli avec contrôle fin des paramètres.',
    steps: [],
  }))
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [commandFilter, setCommandFilter] = useState('')
  const [showAllCommands, setShowAllCommands] = useState(false)
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const reloadLocalSpec = useCallback(() => {
    try {
      setSpec(loadSpec())
      setLoadState('ready')
      setLoadError(null)
    } catch (e) {
      setLoadState('error')
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
  }, [])

  useEffect(() => {
    reloadLocalSpec()
    fetch('/api/pass-cli/version')
      .then((r) => r.json())
      .then(setCliVersion)
      .catch(() => setCliVersion({ available: false }))
  }, [reloadLocalSpec])

  const governanceCommands = useMemo(() => {
    if (!spec) return []
    return spec.commands.filter((c) => (showAllCommands ? true : isPrimaryGovernanceCommand(c)))
  }, [spec, showAllCommands])

  const filteredCommands = useMemo(() => {
    const q = commandFilter.trim().toLowerCase()
    if (!q) return governanceCommands
    return governanceCommands.filter((c) => c.id.includes(q) || c.synopsis.toLowerCase().includes(q))
  }, [governanceCommands, commandFilter])

  const selectedStep = group.steps.find((s) => s.id === selectedStepId) ?? group.steps[0]
  const selectedCommand = spec?.commands.find((c) => c.id === selectedStep?.commandId)

  const script = spec ? generatePosixScript(spec, group) : ''

  const versionMismatch =
    cliVersion?.available &&
    spec?.cliVersionKnown &&
    cliVersion.version &&
    !cliVersion.version.includes(spec.cliVersionKnown)

  async function handleRefreshDocs() {
    setRefreshing(true)
    setRunError(null)
    try {
      const res = await fetch('/api/spec/refresh')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Échec de l’actualisation')
      reloadLocalSpec()
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Actualisation impossible')
    } finally {
      setRefreshing(false)
    }
  }

  function loadStarter(g: GroupConfig) {
    setGroup({ ...g, id: g.id, steps: g.steps.map((s) => ({ ...s, id: `step-${crypto.randomUUID().slice(0, 8)}` })) })
    setSelectedStepId(null)
  }

  function addStep(commandId: string) {
    const step = newStep(commandId)
    setGroup((g) => ({ ...g, steps: [...g.steps, step] }))
    setSelectedStepId(step.id)
  }

  function updateBinding(
    stepId: string,
    kind: 'flag' | 'positional',
    key: string,
    binding: ParamBinding | undefined,
  ) {
    setGroup((g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.id !== stepId) return s
        if (kind === 'flag') {
          return { ...s, flagValues: { ...s.flagValues, [key]: binding } }
        }
        return { ...s, positionalValues: { ...s.positionalValues, [key]: binding } }
      }),
    }))
  }

  async function copyScript() {
    await navigator.clipboard.writeText(script)
  }

  async function runGroup() {
    setRunOutput(null)
    setRunError(null)
    if (!spec) return
    const outputs: string[] = []
    for (const step of group.steps) {
      const cmd = spec.commands.find((c) => c.id === step.commandId)
      if (!cmd || !isLocallyRunnable(cmd)) {
        setRunError(
          'Latch n’exécute pas les commandes qui lisent des items ou des secrets. Exportez le script POSIX et lancez-le dans votre terminal.',
        )
        return
      }
      const preview = formatCommandPreview(spec, step)
      const argv = preview.replace(/^pass-cli\s+/, '').split(/\s+/)
      const res = await fetch('/api/pass-cli/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ argv: ['pass-cli', ...argv] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRunError(data.error || 'Exécution refusée')
        return
      }
      outputs.push(data.stdout || data.stderr || '(vide)')
    }
    setRunOutput(outputs.join('\n---\n'))
  }

  if (loadState === 'loading') {
    return (
      <div className="layout">
        <p className="muted">Chargement de la spécification pass-cli…</p>
      </div>
    )
  }

  if (loadState === 'error' || !spec) {
    return (
      <div className="layout">
        <h1>Latch</h1>
        <p className="error">Impossible de charger la documentation : {loadError}</p>
      </div>
    )
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>Latch</h1>
          <p className="tagline">
            Interface locale pour maîtriser <code>pass-cli</code> — gouvernance des coffres, PAT, agents et
            accès. Aucun secret stocké ici.
          </p>
        </div>
        <div className="header-meta">
          <a href={spec.sourceUrl} target="_blank" rel="noreferrer">
            Documentation officielle
          </a>
          <span className="muted">Spec : {new Date(spec.fetchedAt).toLocaleString('fr-FR')}</span>
          {cliVersion?.available ? (
            <span className="ok">pass-cli {cliVersion.version}</span>
          ) : (
            <span className="warn">pass-cli absent du PATH</span>
          )}
          {versionMismatch && <span className="warn">Version CLI différente du snapshot</span>}
          <button type="button" onClick={handleRefreshDocs} disabled={refreshing}>
            {refreshing ? 'Actualisation…' : 'Actualiser la spec'}
          </button>
        </div>
      </header>

      <section className="panel">
        <h2>Modèles (gouvernance)</h2>
        <p className="muted">
          PAT ciblés, visibilité des accès et des expirations, membres et agents — sans lecture de contenu
          d’items.
        </p>
        <div className="starter-grid">
          {STARTER_GROUPS.map((g) => (
            <button key={g.id} type="button" className="starter-card" onClick={() => loadStarter(g)}>
              <strong>{g.name}</strong>
              <span>{g.description}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="main-grid">
        <section className="panel">
          <h2>Groupe de commandes</h2>
          {group.steps.length === 0 ? (
            <p className="muted">Groupe vide — choisissez un modèle ou ajoutez une commande.</p>
          ) : (
            <ol className="step-list">
              {group.steps.map((step, i) => {
                const cmd = spec.commands.find((c) => c.id === step.commandId)
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      className={selectedStep?.id === step.id ? 'step-active' : ''}
                      onClick={() => setSelectedStepId(step.id)}
                    >
                      {i + 1}. {cmd?.id ?? step.commandId}
                    </button>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() =>
                        setGroup((g) => ({
                          ...g,
                          steps: g.steps.filter((s) => s.id !== step.id),
                        }))
                      }
                    >
                      Retirer
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          <h3>Ajouter une commande</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showAllCommands}
              onChange={(e) => setShowAllCommands(e.target.checked)}
            />
            Afficher toutes les commandes documentées (composition sans lecture d’items)
          </label>
          <input
            className="input"
            placeholder="Filtrer (ex. pat, vault, agent)…"
            value={commandFilter}
            onChange={(e) => setCommandFilter(e.target.value)}
          />
          <div className="command-pick">
            {filteredCommands.slice(0, 40).map((c) => (
              <button key={c.id} type="button" onClick={() => addStep(c.id)}>
                <span>{c.id}</span>
                <small>{CATEGORY_LABELS[c.category] ?? c.category}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Paramètres</h2>
          {!selectedStep || !selectedCommand ? (
            <p className="muted">Sélectionnez une étape pour configurer chaque flag documenté.</p>
          ) : (
            <>
              {selectedCommand.composeOnly && (
                <p className="warn">
                  Composition uniquement : Latch ne récupère ni n’affiche le contenu d’items ni les secrets
                  produits par cette commande.
                </p>
              )}
              <p className="mono preview">{formatCommandPreview(spec, selectedStep)}</p>
              <ParamEditor
                step={selectedStep}
                command={selectedCommand}
                priorSteps={group.steps.filter((s) => s.id !== selectedStep.id)}
                onBinding={updateBinding}
              />
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Script POSIX (sh)</h2>
        <p className="muted">Aperçu exact avant exécution locale. Compatible sh, pas zsh.</p>
        <pre className="script-block">{script}</pre>
        <div className="actions">
          <button type="button" onClick={copyScript}>Copier le script</button>
          <button type="button" onClick={runGroup} disabled={!cliVersion?.available || group.steps.length === 0}>
            Exécuter localement (métadonnées)
          </button>
        </div>
        {runError && <p className="error">{runError}</p>}
        {runOutput && (
          <pre className="output-block">{runOutput}</pre>
        )}
      </section>

      <footer className="footer muted">
        Latch n’est pas affilié à Proton AG. Client indépendant, zéro confiance : rien n’est envoyé à un
        serveur distant.
      </footer>
    </div>
  )
}

function ParamEditor({
  step,
  command,
  priorSteps,
  onBinding,
}: {
  step: StepConfig
  command: CommandDef
  priorSteps: StepConfig[]
  onBinding: (
    stepId: string,
    kind: 'flag' | 'positional',
    key: string,
    binding: ParamBinding | undefined,
  ) => void
}) {
  const fields = [
    ...command.flags.map((f) => ({ kind: 'flag' as const, key: f.name, def: f })),
    ...command.positionalArgs.map((p) => ({ kind: 'positional' as const, key: p.name, def: p })),
  ]

  if (fields.length === 0) {
    return <p className="muted">Aucun paramètre documenté pour cette commande dans la spec.</p>
  }

  return (
    <div className="param-grid">
      {fields.map(({ kind, key, def }) => {
        const current =
          kind === 'flag' ? step.flagValues[key] : step.positionalValues[key]
        return (
          <div key={key} className="param-row">
            <label>
              <code>{key}</code>
              {def.required && <span className="req">requis</span>}
              {def.help && <span className="help">{def.help}</span>}
            </label>
            <div className="param-controls">
              <select
                value={current?.kind === 'step' ? 'step' : 'literal'}
                onChange={(e) => {
                  if (e.target.value === 'literal') {
                    onBinding(step.id, kind, key, { kind: 'literal', value: '' })
                  } else {
                    const first = priorSteps[0]
                    if (first) {
                      onBinding(step.id, kind, key, {
                        kind: 'step',
                        stepId: first.id,
                        jqPath: SAFE_BIND_PATHS[0],
                      })
                    }
                  }
                }}
              >
                <option value="literal">Valeur saisie</option>
                <option value="step" disabled={priorSteps.length === 0}>
                  Lier à une étape précédente
                </option>
              </select>
              {current?.kind === 'step' ? (
                <>
                  <select
                    value={current.stepId}
                    onChange={(e) =>
                      onBinding(step.id, kind, key, {
                        ...current,
                        stepId: e.target.value,
                      })
                    }
                  >
                    {priorSteps.map((ps, i) => (
                      <option key={ps.id} value={ps.id}>
                        Étape {i + 1} ({ps.commandId})
                      </option>
                    ))}
                  </select>
                  <select
                    value={current.jqPath}
                    onChange={(e) =>
                      onBinding(step.id, kind, key, { ...current, jqPath: e.target.value })
                    }
                  >
                    {SAFE_BIND_PATHS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </>
              ) : (
                kind === 'flag' && def.type === 'enum' && 'allowedValues' in def && def.allowedValues ? (
                  <select
                    value={current?.kind === 'literal' ? current.value : ''}
                    onChange={(e) =>
                      onBinding(step.id, kind, key, { kind: 'literal', value: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    {def.allowedValues.map((v: string) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={kind === 'flag' && 'valueKind' in def && def.valueKind === 'sensitive' ? 'password' : 'text'}
                    autoComplete="off"
                    placeholder="valeur"
                    value={current?.kind === 'literal' ? current.value : ''}
                    onChange={(e) =>
                      onBinding(step.id, kind, key, { kind: 'literal', value: e.target.value })
                    }
                  />
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default App
