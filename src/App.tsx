import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { getDocHover, getHumanLabel, pickCanonicalCommand } from './lib/commandLabels'
import { isLocallyRunnable } from './lib/commandPolicy'
import {
  DOCUMENTED_EXPIRATIONS,
  EXPIRATION_PRESETS,
  isExpirationFlag,
} from './lib/expirationPresets'
import {
  buildStepFromFlow,
  ENTRY_POINTS,
  getStartersForEntry,
  type EntryPoint,
  type OutputFormat,
} from './lib/governanceFlow'
import { isKeyringOrSudoError, KEYCHAIN_USER_MESSAGE } from './lib/keyringErrors'
import { copyToClipboard } from './lib/copyToClipboard'
import { commandTextUsesSudo, SUDO_REFUSAL_MESSAGE } from './lib/sudoPolicy'
import { LATCH_INSTALL_PATH } from './lib/installPath'
import { formatCommandPreview, generatePosixScript } from './lib/script'
import { CATEGORY_LABELS, isPrimaryGovernanceCommand, loadSpec } from './lib/spec'
import { STARTER_GROUPS } from './lib/starterGroups'
import type { CommandDef, GroupConfig, ParamBinding, PassCliSpec, StepConfig } from './lib/types'
import { SAFE_BIND_PATHS } from './lib/types'

type LoadState = 'loading' | 'ready' | 'error'

const ROLES = ['viewer', 'editor', 'manager'] as const

function newStep(commandId: string): StepConfig {
  return {
    id: `step-${crypto.randomUUID().slice(0, 8)}`,
    commandId,
    flagValues: {},
    positionalValues: {},
  }
}

function resolveCommand(spec: PassCliSpec, commandId: string): CommandDef | undefined {
  return pickCanonicalCommand(spec, commandId) ?? spec.commands.find((c) => c.id === commandId)
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
  const [entryPoint, setEntryPoint] = useState<EntryPoint | null>(null)
  const [flowActionKey, setFlowActionKey] = useState<string | null>(null)
  const [flowOutput, setFlowOutput] = useState<OutputFormat>('json')
  const [flowRole, setFlowRole] = useState<(typeof ROLES)[number]>('viewer')
  const [commandFilter, setCommandFilter] = useState('')
  const [showAllCommands, setShowAllCommands] = useState(false)
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

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

  const entryDef = useMemo(
    () => ENTRY_POINTS.find((e) => e.id === entryPoint) ?? null,
    [entryPoint],
  )

  const flowAction = useMemo(() => {
    if (!entryDef || !flowActionKey) return null
    return entryDef.actions.find((a) => `${a.commandId}-${a.label}` === flowActionKey) ?? null
  }, [entryDef, flowActionKey])

  const governanceCommands = useMemo(() => {
    if (!spec) return []
    return spec.commands.filter((c) => (showAllCommands ? true : isPrimaryGovernanceCommand(c)))
  }, [spec, showAllCommands])

  const filteredCommands = useMemo(() => {
    const q = commandFilter.trim().toLowerCase()
    if (!q) return governanceCommands
    return governanceCommands.filter(
      (c) =>
        c.id.includes(q) ||
        c.synopsis.toLowerCase().includes(q) ||
        getHumanLabel(c).toLowerCase().includes(q),
    )
  }, [governanceCommands, commandFilter])

  const selectedStep = group.steps.find((s) => s.id === selectedStepId) ?? group.steps[0]
  const selectedCommand = spec && selectedStep ? resolveCommand(spec, selectedStep.commandId) : undefined

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
    setGroup({
      ...g,
      id: g.id,
      steps: g.steps.map((s) => ({ ...s, id: `step-${crypto.randomUUID().slice(0, 8)}` })),
    })
    setSelectedStepId(null)
  }

  function addStep(commandId: string) {
    const cmd = spec ? resolveCommand(spec, commandId) : undefined
    const step = newStep(cmd?.id ?? commandId)
    setGroup((g) => ({ ...g, steps: [...g.steps, step] }))
    setSelectedStepId(step.id)
  }

  function addFromFlow() {
    if (!spec || !flowAction) return
    const cmd = pickCanonicalCommand(spec, flowAction.commandId)
    if (!cmd) {
      setRunError(`Commande documentée introuvable dans la spec : ${flowAction.commandId}`)
      return
    }
    const step = buildStepFromFlow(
      cmd.id,
      flowAction.needsOutputFormat ? flowOutput : null,
      flowAction.needsRole ? flowRole : null,
    )
    setGroup((g) => ({ ...g, steps: [...g.steps, step] }))
    setSelectedStepId(step.id)
    setRunError(null)
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

  function assertNoSudoInGroup(): boolean {
    if (!spec) return true
    for (const step of group.steps) {
      const preview = formatCommandPreview(spec, step)
      if (commandTextUsesSudo(preview)) {
        setRunError(SUDO_REFUSAL_MESSAGE)
        return false
      }
      for (const b of Object.values(step.flagValues)) {
        if (b?.kind === 'literal' && commandTextUsesSudo(b.value)) {
          setRunError(SUDO_REFUSAL_MESSAGE)
          return false
        }
      }
      for (const b of Object.values(step.positionalValues)) {
        if (b?.kind === 'literal' && commandTextUsesSudo(b.value)) {
          setRunError(SUDO_REFUSAL_MESSAGE)
          return false
        }
      }
    }
    return true
  }

  function copyScript() {
    setRunError(null)
    setCopyNotice(null)
    if (!assertNoSudoInGroup()) return

    void copyToClipboard(script).then((ok) => {
      if (ok) {
        setCopyNotice('Script copié dans le presse-papiers.')
      } else {
        setRunError(
          'Impossible de copier le script (permission refusée ou contexte non sécurisé). Sélectionnez le bloc ci-dessus manuellement.',
        )
      }
    })
  }

  async function runGroup() {
    setRunOutput(null)
    setRunError(null)
    setCopyNotice(null)
    if (!spec) return
    if (!cliVersion?.available) {
      setRunError('pass-cli n’est pas disponible sur PATH sur cette machine.')
      return
    }
    if (!assertNoSudoInGroup()) return
    const outputs: string[] = []
    for (const step of group.steps) {
      const cmd = resolveCommand(spec, step.commandId)
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
        if (data.sudo) {
          setRunError(SUDO_REFUSAL_MESSAGE)
        } else if (data.keyring || isKeyringOrSudoError(data.error || '')) {
          setRunError(KEYCHAIN_USER_MESSAGE)
        } else {
          setRunError(data.error || 'Exécution refusée')
        }
        return
      }
      const combined = `${data.stderr ?? ''}\n${data.stdout ?? ''}`
      if (isKeyringOrSudoError(combined)) {
        setRunError(KEYCHAIN_USER_MESSAGE)
        return
      }
      outputs.push(data.stdout || data.stderr || '(vide)')
    }
    setRunOutput(outputs.join('\n---\n'))
  }

  function renderStepLabel(cmd: CommandDef | undefined, commandId: string) {
    if (cmd && spec) {
      return (
        <span className="cmd-label" title={getDocHover(spec, cmd)}>
          {getHumanLabel(cmd)}
        </span>
      )
    }
    return <span className="cmd-label">{commandId.replace(/\./g, ' · ')}</span>
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
          <p className="muted install-path">
            Installation prévue : <code>{LATCH_INSTALL_PATH}</code> (pas à la racine du home).
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
        <h2>Point d’entrée gouvernance</h2>
        {!entryPoint ? (
          <>
            <p className="muted">
              Choisissez par quoi vous raisonnez : coffre, PAT/agent, ou item comme cible d’accès (ID/titre —
              jamais le contenu).
            </p>
            <div className="flow-grid">
              {ENTRY_POINTS.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  className="starter-card"
                  onClick={() => {
                    setEntryPoint(ep.id)
                    setFlowActionKey(null)
                  }}
                >
                  <strong>{ep.title}</strong>
                  <span>{ep.description}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              <button type="button" className="linkish" onClick={() => setEntryPoint(null)}>
                ← Changer de point d’entrée
              </button>
              {' · '}
              {entryDef?.title}
            </p>

            <h3>1. Lister d’abord, puis agir</h3>
            <p className="muted">Sélectionnez l’action supportée par la doc pass-cli pour cet objet.</p>
            <div className="flow-grid">
              {entryDef?.actions.map((action) => (
                <button
                  key={`${action.commandId}-${action.label}`}
                  type="button"
                  className={`starter-card ${flowActionKey === `${action.commandId}-${action.label}` ? 'flow-selected' : ''}`}
                  onClick={() => setFlowActionKey(`${action.commandId}-${action.label}`)}
                >
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                  {action.composeOnlyHint && <span className="warn">Composition uniquement</span>}
                </button>
              ))}
            </div>

            {entryDef && getStartersForEntry(entryDef, STARTER_GROUPS).length > 0 && (
              <>
                <h3>Modèles rapides (même flux)</h3>
                <div className="starter-grid">
                  {getStartersForEntry(entryDef, STARTER_GROUPS).map((g) => (
                    <button key={g.id} type="button" className="starter-card" onClick={() => loadStarter(g)}>
                      <strong>{g.name}</strong>
                      <span>{g.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {flowAction && (
              <div className="flow-options">
                {flowAction.needsOutputFormat && (
                  <fieldset>
                    <legend>Format de sortie</legend>
                    <label>
                      <input
                        type="radio"
                        name="output"
                        checked={flowOutput === 'json'}
                        onChange={() => setFlowOutput('json')}
                      />
                      JSON (<code>--output json</code>)
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="output"
                        checked={flowOutput === 'human'}
                        onChange={() => setFlowOutput('human')}
                      />
                      Lisible (<code>--output human</code>)
                    </label>
                  </fieldset>
                )}
                {flowAction.needsRole && (
                  <fieldset>
                    <legend>Droit accordé (doc)</legend>
                    {ROLES.map((r) => (
                      <label key={r}>
                        <input
                          type="radio"
                          name="role"
                          checked={flowRole === r}
                          onChange={() => setFlowRole(r)}
                        />
                        {r}
                      </label>
                    ))}
                  </fieldset>
                )}
                <button type="button" onClick={addFromFlow}>
                  Ajouter cette étape au groupe
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <div className="main-grid">
        <section className="panel">
          <h2>Groupe de commandes</h2>
          {group.steps.length === 0 ? (
            <p className="muted">Groupe vide — utilisez un point d’entrée ou ajoutez une commande ci-dessous.</p>
          ) : (
            <ol className="step-list">
              {group.steps.map((step, i) => {
                const cmd = resolveCommand(spec, step.commandId)
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      className={selectedStep?.id === step.id ? 'step-active' : ''}
                      onClick={() => setSelectedStepId(step.id)}
                    >
                      {i + 1}. {renderStepLabel(cmd, step.commandId)}
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

          <h3>Ajouter une commande (avancé)</h3>
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
              <button key={c.id} type="button" onClick={() => addStep(c.id)} title={getDocHover(spec, c)}>
                <span>{getHumanLabel(c)}</span>
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
        <p className="muted">Aperçu exact avant exécution locale. Compatible sh, pas zsh. Jamais via sudo.</p>
        <pre className="script-block">{script}</pre>
        <div className="actions">
          <button type="button" onClick={copyScript}>Copier le script</button>
          <button type="button" onClick={runGroup} disabled={group.steps.length === 0}>
            Exécuter localement (métadonnées)
          </button>
        </div>
        {copyNotice && <p className="ok">{copyNotice}</p>}
        {runError && <p className="error pre-wrap">{runError}</p>}
        {runOutput && <pre className="output-block">{runOutput}</pre>}
      </section>

      <footer className="footer muted">
        Latch n’est pas affilié à Proton AG. Client indépendant, zéro confiance : rien n’est envoyé à un
        serveur distant. Chemin local documenté : <code>{LATCH_INSTALL_PATH}</code>.
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
        const current = kind === 'flag' ? step.flagValues[key] : step.positionalValues[key]
        const expiration = kind === 'flag' && isExpirationFlag(key)
        const presetValue =
          current?.kind === 'literal' && DOCUMENTED_EXPIRATIONS.includes(current.value as typeof DOCUMENTED_EXPIRATIONS[number])
            ? current.value
            : 'custom'

        return (
          <div key={key} className="param-row">
            <label>
              <code>{key}</code>
              {def.required && <span className="req">requis</span>}
              {def.help && <span className="help">{def.help}</span>}
            </label>
            <div className="param-controls">
              {expiration && (
                <select
                  value={presetValue}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'custom') {
                      onBinding(step.id, kind, key, { kind: 'literal', value: '' })
                    } else {
                      onBinding(step.id, kind, key, { kind: 'literal', value: v })
                    }
                  }}
                >
                  {EXPIRATION_PRESETS.map((p) => (
                    <option key={p.label} value={p.value}>{p.label}</option>
                  ))}
                </select>
              )}
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
              ) : kind === 'flag' && def.type === 'enum' && 'allowedValues' in def && def.allowedValues ? (
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
                  type={
                    kind === 'flag' && 'valueKind' in def && def.valueKind === 'sensitive'
                      ? 'password'
                      : 'text'
                  }
                  autoComplete="off"
                  placeholder={expiration && presetValue !== 'custom' ? '' : 'valeur'}
                  value={current?.kind === 'literal' ? current.value : ''}
                  onChange={(e) =>
                    onBinding(step.id, kind, key, { kind: 'literal', value: e.target.value })
                  }
                  disabled={expiration && presetValue !== 'custom'}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default App
