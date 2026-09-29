import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  type ComposeSettings,
  type ComposerBlock,
  type FamilyConfig,
  collectFlagEnum,
  composeBashScript,
  composeSimpleCommandLine,
  availableListPreviewChips,
  composeSimpleListPreview,
  composeSimpleListPreviewAll,
  type ListPreviewPick,
  nodeIsComposable,
  simplePlaceholderForFlag,
} from './lib/bashComposer'
import { copyToClipboard, copyWithExecCommand } from './lib/copyToClipboard'
import {
  LIST_FAMILIES,
  type FamilyKey,
  type HelpMappingFile,
  commandLabel,
  familyHasList,
  getNode,
  loadBundledMapping,
} from './lib/helpMapping'
import type { PassCliRefreshUpdate, PassCliVersionInfo } from './lib/passCliApiTypes'
import {
  applyExclusiveChoice,
  exclusivePairsOnNode,
  EXCLUSIVE_UI_PAIRS,
  flagsHiddenByExclusiveUi,
  pickExclusiveFlag,
  setExclusiveMode,
} from './lib/flagExclusivity'
import { scriptContainsSudoWord, userInputUsesSudo } from './lib/sudoPolicy'

const INPUT_REFUSAL = 'Saisie refusée.'
const COPY_SCRIPT_REFUSAL = 'Copie refusée : le script contient une saisie interdite.'

function defaultFamilies(mapping: HelpMappingFile): Record<FamilyKey, FamilyConfig> {
  const base = (_key: FamilyKey, listPath: string[]): FamilyConfig => ({
    mode: familyHasList(mapping, listPath) ? 'manual' : 'off',
    manualNames: [],
    useInLoops: familyHasList(mapping, listPath),
  })
  return {
    vault: base('vault', ['vault', 'list']),
    agent: base('agent', ['agent', 'list']),
    pat: base('pat', ['personal-access-token', 'list']),
    share: base('share', ['share', 'list']),
  }
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      <span className="segmented-label">{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={value === opt ? 'segmented-active' : ''}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function App() {
  const [mapping, setMapping] = useState<HelpMappingFile>(() => loadBundledMapping())
  const [navPath, setNavPath] = useState<string[]>([])
  const [blocks, setBlocks] = useState<ComposerBlock[]>([])
  const [role, setRole] = useState('editor')
  const [outputFormat, setOutputFormat] = useState<'json' | 'human'>('json')
  const [families, setFamilies] = useState<Record<FamilyKey, FamilyConfig>>(() =>
    defaultFamilies(loadBundledMapping()),
  )
  const [cliVersion, setCliVersion] = useState<PassCliVersionInfo | null>(null)
  const [latchWorkspacePath, setLatchWorkspacePath] = useState<string | null>(null)
  const [updateRefreshHint, setUpdateRefreshHint] = useState<PassCliRefreshUpdate | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [nakedCopyNotice, setNakedCopyNotice] = useState<string | null>(null)
  const [scriptCopyNotice, setScriptCopyNotice] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [listPreviewPick, setListPreviewPick] = useState<ListPreviewPick | 'all' | null>(null)
  const [listOutype, setListOutype] = useState<'json' | 'human'>('json')

  const roleOptions = useMemo(() => {
    const fromMap = collectFlagEnum(mapping, '--role')
    return fromMap.length ? fromMap : ['viewer', 'editor', 'manager']
  }, [mapping])

  const outputOptions = useMemo(() => {
    const fromMap = collectFlagEnum(mapping, '--output')
    return (fromMap.length ? fromMap : ['json', 'human']) as ('json' | 'human')[]
  }, [mapping])

  useEffect(() => {
    if (!roleOptions.includes(role)) setRole(roleOptions[0] ?? 'viewer')
  }, [roleOptions, role])

  useEffect(() => {
    if (!outputOptions.includes(outputFormat)) setOutputFormat(outputOptions[0] ?? 'json')
  }, [outputOptions, outputFormat])

  useEffect(() => {
    fetch('/api/latch/workspace')
      .then((r) => r.json())
      .then((data: { path?: string | null }) => setLatchWorkspacePath(data.path ?? null))
      .catch(() => setLatchWorkspacePath(null))
  }, [])

  useEffect(() => {
    fetch('/api/pass-cli/version')
      .then((r) => r.json())
      .then(setCliVersion)
      .catch(() => setCliVersion({ available: false, mappingDrift: null }))
  }, [])

  const currentNode = useMemo(() => getNode(mapping, navPath), [mapping, navPath])
  const settings: ComposeSettings = useMemo(
    () => ({ role, outputFormat, families }),
    [role, outputFormat, families],
  )

  const listPreviewChips = useMemo(() => availableListPreviewChips(mapping), [mapping])

  const composedSimpleLine = useMemo(
    () => composeSimpleCommandLine(mapping, blocks),
    [mapping, blocks],
  )

  const simpleLine = useMemo(() => {
    if (listPreviewPick === 'all') {
      return composeSimpleListPreviewAll(mapping, listPreviewChips, listOutype)
    }
    if (listPreviewPick) {
      const chip = listPreviewChips.find((c) => c.pick === listPreviewPick)
      if (chip) return composeSimpleListPreview(mapping, chip, listOutype)
    }
    return composedSimpleLine
  }, [listPreviewPick, mapping, listPreviewChips, listOutype, composedSimpleLine])

  const simpleLineForCopyNotice = useRef(simpleLine)
  useEffect(() => {
    if (simpleLineForCopyNotice.current !== simpleLine) {
      simpleLineForCopyNotice.current = simpleLine
      setNakedCopyNotice(null)
    }
  }, [simpleLine])

  const script = useMemo(
    () => composeBashScript(mapping, blocks, settings),
    [mapping, blocks, settings],
  )

  const mappingDrift =
    cliVersion?.mappingDrift === true ||
    (cliVersion?.mappingDrift == null &&
      cliVersion?.available &&
      mapping.passCliVersion &&
      cliVersion.localSemver &&
      cliVersion.mappingSemver &&
      cliVersion.localSemver !== cliVersion.mappingSemver)

  const refreshMapping = useCallback(async () => {
    setRefreshing(true)
    setRunError(null)
    setUpdateRefreshHint(null)
    try {
      const res = await fetch('/api/help/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setRunError(
          data.error ||
            'pass-cli absent : conservation du dernier mapping embarqué. Installez pass-cli puis actualisez.',
        )
        if (data.update) setUpdateRefreshHint(data.update as PassCliRefreshUpdate)
        return
      }
      setMapping(data.mapping as HelpMappingFile)
      setFamilies(defaultFamilies(data.mapping as HelpMappingFile))
      setListPreviewPick(null)
      if (data.version) setCliVersion(data.version as PassCliVersionInfo)
      if (data.update) setUpdateRefreshHint(data.update as PassCliRefreshUpdate)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Actualisation impossible')
    } finally {
      setRefreshing(false)
    }
  }, [])

  function navigateTo(path: string[]) {
    setNavPath(path)
    setRunError(null)
  }

  function addBlock(path: string[]) {
    const node = getNode(mapping, path)
    if (!node || !nodeIsComposable(node)) return
    setListPreviewPick(null)
    setBlocks((b) => [...b, { id: crypto.randomUUID().slice(0, 8), path, bindings: {} }])
    setAssistantError(null)
  }

  function copyText(text: string, onOk: (msg: string) => void, onFail: (msg: string) => void, okMsg: string) {
    setRunError(null)
    if (scriptContainsSudoWord(text)) {
      onFail(COPY_SCRIPT_REFUSAL)
      return
    }
    if (copyWithExecCommand(text)) {
      onOk(okMsg)
      return
    }
    void copyToClipboard(text)
      .then((ok) => {
        if (ok) onOk(okMsg)
        else onFail('Impossible de copier (permission refusée ou contexte non sécurisé).')
      })
      .catch(() => onFail('Impossible de copier (permission refusée ou contexte non sécurisé).'))
  }

  function copySimpleLine() {
    setNakedCopyNotice(null)
    setScriptCopyNotice(null)
    copyText(
      simpleLine,
      setNakedCopyNotice,
      setRunError,
      'Commande copiée (mode simple, sans variables).',
    )
  }

  function copyScript() {
    setNakedCopyNotice(null)
    setScriptCopyNotice(null)
    copyText(script, setScriptCopyNotice, setRunError, 'Script bash complet copié dans le presse-papiers.')
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>Latch</h1>
          <p className="tagline">
            Composer des scripts <code>pass-cli</code> à partir de l’aide officielle — rien n’est exécuté dans
            cette page.
          </p>
          {latchWorkspacePath && (
            <p className="muted install-path">
              Installation : <code>{latchWorkspacePath}</code>
            </p>
          )}
        </div>
        <div className="header-meta">
          {mapping.fixture && <span className="warn">Mapping fixture / embarqué</span>}
          <span className="muted">
            Mapping : {mapping.passCliVersion ?? 'inconnu'} · {new Date(mapping.generatedAt).toLocaleString('fr-FR')}
          </span>
          {cliVersion?.available ? (
            <span className="ok">pass-cli local : {cliVersion.version}</span>
          ) : (
            <span className="warn">pass-cli absent — dernier mapping conservé</span>
          )}
          {cliVersion?.available && mappingDrift && (
            <span className="warn">
              Décalage pass-cli / mapping embarqué
              {cliVersion.localSemver && cliVersion.mappingSemver
                ? ` (${cliVersion.localSemver} ≠ ${cliVersion.mappingSemver})`
                : ''}
            </span>
          )}
          {cliVersion?.available && cliVersion.mappingDrift === false && (
            <span className="ok">pass-cli aligné sur le mapping embarqué</span>
          )}
          {cliVersion?.upstream?.latestSemver && cliVersion.upstream.reliable === false && (
            <span className="muted small">
              Release GitHub : {cliVersion.upstream.latestTag ?? cliVersion.upstream.latestSemver}
              {cliVersion.upstream.behindUpstream === true && ' — version locale antérieure (indicatif)'}
              {cliVersion.upstream.behindUpstream === false && ' — version locale ≥ release GitHub (indicatif)'}
            </span>
          )}
          {cliVersion?.upstream?.disclaimerFr && (
            <span className="muted small">{cliVersion.upstream.disclaimerFr}</span>
          )}
          {updateRefreshHint && !updateRefreshHint.ran && (
            <span className="muted small">
              Mise à jour pass-cli : {updateRefreshHint.skippedReasonFr} Copier :{' '}
              <code>{updateRefreshHint.copyCommand}</code>
            </span>
          )}
          {updateRefreshHint?.ran && (
            <span className="ok">pass-cli mis à jour depuis ce serveur (sans invite).</span>
          )}
          <button type="button" onClick={refreshMapping} disabled={refreshing}>
            {refreshing ? 'Actualisation…' : 'Actualiser le mapping'}
          </button>
        </div>
      </header>

      <div className="top-grid">
        <section className="panel panel-compact">
          <h2>Menu pass-cli</h2>
          <p className="muted breadcrumb">
            <button type="button" className="crumb" disabled={navPath.length === 0} onClick={() => navigateTo([])}>
              Racine
            </button>
            {navPath.map((p, i) => (
              <span key={i}>
                {' / '}
                <button type="button" className="crumb" onClick={() => navigateTo(navPath.slice(0, i + 1))}>
                  {p}
                </button>
              </span>
            ))}
          </p>
          <ul className="menu-list dense">
            {currentNode?.children.map((child) => {
              const childPath = [...navPath, child.name]
              const childNode = getNode(mapping, childPath)
              const hasChildren = Boolean(childNode && childNode.children.length > 0)
              const canAdd = Boolean(childNode && nodeIsComposable(childNode))
              return (
                <li key={child.name} className="menu-item dense">
                  <div className="menu-label">
                    <strong>{child.name}</strong>
                    <span className="muted"> — {child.description}</span>
                  </div>
                  <div className="menu-actions">
                    {hasChildren && (
                      <button type="button" className="btn-open" onClick={() => navigateTo(childPath)}>
                        Ouvrir
                      </button>
                    )}
                    {canAdd && (
                      <button type="button" className="btn-add" onClick={() => addBlock(childPath)}>
                        Ajouter au script
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel panel-compact">
          <h2>Nœud ouvert</h2>
          {(listPreviewChips.length > 0 || listPreviewPick) && (
            <div className="list-preview-chips" role="group" aria-label="Aperçu des commandes list (sans exécution)">
              {listPreviewChips.map((chip) => (
                <button
                  key={chip.pick}
                  type="button"
                  className={`chip ${listPreviewPick === chip.pick ? 'chip-active' : ''}`}
                  onClick={() => setListPreviewPick(chip.pick)}
                >
                  {chip.label}
                </button>
              ))}
              {listPreviewChips.length > 1 && (
                <button
                  type="button"
                  className={`chip ${listPreviewPick === 'all' ? 'chip-active' : ''}`}
                  onClick={() => setListPreviewPick('all')}
                >
                  Tous
                </button>
              )}
              <button
                type="button"
                className="chip chip-outype"
                onClick={() => setListOutype((v) => (v === 'json' ? 'human' : 'json'))}
                aria-label={listOutype === 'json' ? 'outype=json' : 'outype=human'}
                title={listOutype === 'json' ? 'outype=json' : 'outype=human'}
              >
                {listOutype === 'json' ? '🤖' : '👤'}
              </button>
            </div>
          )}
          {simpleLine ? (
            <>
              <pre className="naked-line selectable">{simpleLine}</pre>
              <button type="button" className="btn-secondary" onClick={copySimpleLine}>
                Copier la commande
              </button>
              {nakedCopyNotice && <p className="ok" role="status">{nakedCopyNotice}</p>}
              {runError && !batchMode && <p className="error pre-wrap">{runError}</p>}
            </>
          ) : (
            <p className="muted">Ajoutez des commandes avec Ajouter au script.</p>
          )}
          {!batchMode && blocks.length > 0 && (
            <div className="simple-args">
              <p className="muted small">Renseigner les arguments (mode simple) :</p>
              <ol className="step-list inline-steps">
                {blocks.map((b, i) => (
                  <li key={b.id} className="step-inline">
                    <span className="step-title">{i + 1}. {commandLabel(b.path)}</span>
                    <BlockEditor
                      mapping={mapping}
                      block={b}
                      simplePlaceholders
                      onSudoReject={() => setAssistantError(INPUT_REFUSAL)}
                      onClearSudo={() => setAssistantError(null)}
                      onChange={(bindings) => {
                        setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, bindings } : x)))
                      }}
                    />
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => setBlocks((x) => x.filter((y) => y.id !== b.id))}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>

      <section className="panel composer-band">
        <h2>Compositeur</h2>
        <label className="batch-switch">
          <input
            type="checkbox"
            checked={batchMode}
            onChange={(e) => {
              setBatchMode(e.target.checked)
              setAssistantError(null)
            }}
          />
          <span>Mode batch</span>
        </label>

        {batchMode && (
          <>
        {assistantError && <p className="error pre-wrap">{assistantError}</p>}

        <div className="composer-toolbar">
          <SegmentedControl
            label="Rôle (--role)"
            options={roleOptions}
            value={role}
            onChange={setRole}
          />
          <SegmentedControl
            label="Sortie (--output)"
            options={outputOptions}
            value={outputFormat}
            onChange={setOutputFormat}
          />
        </div>

        <h3>Familles de listes</h3>
        <p className="muted small">
          Manuel : mémoire jusqu’à la copie. Auto : listage dans votre terminal. Pas d’auto sur <code>item list</code>.
        </p>
        <div className="family-table">
          {LIST_FAMILIES.map((fam) => {
            if (!familyHasList(mapping, fam.listPath)) return null
            const cfg = families[fam.key]
            return (
              <div key={fam.key} className="family-line">
                <label className="family-check">
                  <input
                    type="checkbox"
                    checked={cfg.useInLoops}
                    onChange={(e) =>
                      setFamilies((f) => ({
                        ...f,
                        [fam.key]: { ...f[fam.key], useInLoops: e.target.checked },
                      }))
                    }
                  />
                  <span>{fam.label}</span>
                </label>
                <select
                  className="family-mode"
                  value={cfg.mode}
                  onChange={(e) =>
                    setFamilies((f) => ({
                      ...f,
                      [fam.key]: { ...f[fam.key], mode: e.target.value as FamilyConfig['mode'] },
                    }))
                  }
                >
                  <option value="off">Désactivé</option>
                  <option value="manual">Manuel</option>
                  <option value="auto">Auto</option>
                </select>
                {cfg.mode === 'manual' && (
                  <input
                    className="input family-names"
                    placeholder="Noms (virgules)"
                    value={cfg.manualNames.join(', ')}
                    onChange={(e) => {
                      const parts = e.target.value.split(',').map((s) => s.trim())
                      const rejected = parts.filter((p) => p && userInputUsesSudo(p))
                      if (rejected.length) setAssistantError(INPUT_REFUSAL)
                      else setAssistantError(null)
                      setFamilies((f) => ({
                        ...f,
                        [fam.key]: {
                          ...f[fam.key],
                          manualNames: parts.filter((p) => p && !userInputUsesSudo(p)),
                        },
                      }))
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>

        <h3>Étapes du script</h3>
        {blocks.length === 0 ? (
          <p className="muted">Ajoutez une commande depuis le menu.</p>
        ) : (
          <ol className="step-list inline-steps">
            {blocks.map((b, i) => (
              <li key={b.id} className="step-inline">
                <span className="step-title">{i + 1}. {commandLabel(b.path)}</span>
                <BlockEditor
                  mapping={mapping}
                  block={b}
                  onSudoReject={() => setAssistantError(INPUT_REFUSAL)}
                  onClearSudo={() => setAssistantError(null)}
                  onChange={(bindings) => {
                    setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, bindings } : x)))
                  }}
                />
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setBlocks((x) => x.filter((y) => y.id !== b.id))}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ol>
        )}

        <h3>Aperçu bash (temps réel)</h3>
        <p className="muted small">Script complet avec boucles et tableaux. Sélectionnable.</p>
        <pre className="script-block selectable">{script}</pre>
        <div className="actions">
          <button type="button" onClick={copyScript}>Copier le script</button>
        </div>
        {scriptCopyNotice && <p className="ok" role="status">{scriptCopyNotice}</p>}
        {runError && batchMode && <p className="error pre-wrap">{runError}</p>}
          </>
        )}
      </section>
    </div>
  )
}

function BlockEditor({
  mapping,
  block,
  onChange,
  onSudoReject,
  onClearSudo,
  simplePlaceholders = false,
}: {
  mapping: HelpMappingFile
  block: ComposerBlock
  onChange: (bindings: Record<string, string>) => void
  onSudoReject: () => void
  onClearSudo: () => void
  simplePlaceholders?: boolean
}) {
  const node = getNode(mapping, block.path)
  if (!node) return null
  const hidden = simplePlaceholders ? flagsHiddenByExclusiveUi(node) : new Set<string>()
  const xorPairs = simplePlaceholders ? exclusivePairsOnNode(node, EXCLUSIVE_UI_PAIRS) : []
  const fields = node.flags.filter((f) => f.name !== '--help' && !hidden.has(f.name))

  function updateField(name: string, value: string) {
    if (value && userInputUsesSudo(value)) {
      onSudoReject()
      return
    }
    onClearSudo()
    onChange({ ...block.bindings, [name]: value })
  }

  function updateExclusive(pair: [string, string], active: string, value: string) {
    if (value && userInputUsesSudo(value)) {
      onSudoReject()
      return
    }
    onClearSudo()
    onChange(applyExclusiveChoice(block.bindings, pair, active, value))
  }

  return (
    <span className="step-fields">
      {xorPairs.map((pair) => {
        const active = pickExclusiveFlag(pair, block)
        const flag = node.flags.find((f) => f.name === active)
        if (!flag) return null
        return (
          <span key={`${pair[0]}|${pair[1]}`} className="step-field step-field-xor">
            <select
              className="input-inline"
              value={active}
              onChange={(e) => onChange(setExclusiveMode(block.bindings, pair, e.target.value))}
              aria-label="Champ exclusif"
            >
              <option value={pair[0]}>{pair[0]}</option>
              <option value={pair[1]}>{pair[1]}</option>
            </select>
            {flag.possibleValues ? (
              <select
                className="input-inline"
                value={block.bindings[active] ?? ''}
                onChange={(e) => updateExclusive(pair, active, e.target.value)}
              >
                <option value="">—</option>
                {flag.possibleValues.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-inline"
                value={block.bindings[active] ?? ''}
                placeholder={simplePlaceholderForFlag(flag)}
                onChange={(e) => updateExclusive(pair, active, e.target.value)}
              />
            )}
          </span>
        )
      })}
      {fields.map((f) => (
        <span key={f.name} className="step-field">
          <code>{f.name}</code>
          {f.possibleValues ? (
            <select
              className="input-inline"
              value={block.bindings[f.name] ?? ''}
              onChange={(e) => updateField(f.name, e.target.value)}
            >
              <option value="">—</option>
              {f.possibleValues.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input
              className="input-inline"
              value={block.bindings[f.name] ?? ''}
              placeholder={simplePlaceholders ? simplePlaceholderForFlag(f) : f.positional ? '$AGENT' : ''}
              onChange={(e) => updateField(f.name, e.target.value)}
            />
          )}
        </span>
      ))}
    </span>
  )
}

export default App
