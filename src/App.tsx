import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  type ComposeSettings,
  type ComposerBlock,
  type FamilyConfig,
  composeBashScript,
  nodeIsComposable,
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
import { LATCH_INSTALL_PATH } from './lib/installPath'
import {
  SUDO_REFUSAL_MESSAGE,
  scriptContainsSudoWord,
  userInputUsesSudo,
} from './lib/sudoPolicy'

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

function App() {
  const [mapping, setMapping] = useState<HelpMappingFile>(() => loadBundledMapping())
  const [navPath, setNavPath] = useState<string[]>([])
  const [blocks, setBlocks] = useState<ComposerBlock[]>([])
  const [role, setRole] = useState('editor')
  const [outputFormat, setOutputFormat] = useState<'json' | 'human'>('json')
  const [families, setFamilies] = useState<Record<FamilyKey, FamilyConfig>>(() =>
    defaultFamilies(loadBundledMapping()),
  )
  const [cliVersion, setCliVersion] = useState<{ available: boolean; version?: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [assistantError, setAssistantError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pass-cli/version')
      .then((r) => r.json())
      .then(setCliVersion)
      .catch(() => setCliVersion({ available: false }))
  }, [])

  const currentNode = useMemo(() => getNode(mapping, navPath), [mapping, navPath])
  const settings: ComposeSettings = useMemo(
    () => ({ role, outputFormat, families }),
    [role, outputFormat, families],
  )

  const script = useMemo(
    () => composeBashScript(mapping, blocks, settings),
    [mapping, blocks, settings],
  )

  const versionStale =
    cliVersion?.available &&
    mapping.passCliVersion &&
    cliVersion.version &&
    !cliVersion.version.includes(mapping.passCliVersion.replace(/^Proton Pass CLI\s+/, '').split(' ')[0])

  const refreshMapping = useCallback(async () => {
    setRefreshing(true)
    setRunError(null)
    try {
      const res = await fetch('/api/help/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setRunError(
          data.error ||
            'pass-cli absent : conservation du dernier mapping embarqué. Installez pass-cli puis actualisez.',
        )
        return
      }
      setMapping(data.mapping as HelpMappingFile)
      setFamilies(defaultFamilies(data.mapping as HelpMappingFile))
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
    const bindings: Record<string, string> = {}
    for (const f of node.flags) {
      if (f.name === '--help') continue
      if (f.possibleValues?.length) bindings[f.name] = f.possibleValues[0]
    }
    setBlocks((b) => [...b, { id: crypto.randomUUID().slice(0, 8), path, bindings }])
    setAssistantError(null)
  }

  function copyScript() {
    setRunError(null)
    setCopyNotice(null)
    if (scriptContainsSudoWord(script)) {
      setRunError(SUDO_REFUSAL_MESSAGE)
      return
    }
    if (copyWithExecCommand(script)) {
      setCopyNotice('Script copié dans le presse-papiers.')
      return
    }
    void copyToClipboard(script)
      .then((ok) => {
        if (ok) setCopyNotice('Script copié dans le presse-papiers.')
        else
          setRunError(
            'Impossible de copier le script (permission refusée ou contexte non sécurisé). Sélectionnez l’aperçu ci-dessus.',
          )
      })
      .catch(() => {
        setRunError(
          'Impossible de copier le script (permission refusée ou contexte non sécurisé). Sélectionnez l’aperçu ci-dessus.',
        )
      })
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
          <p className="muted install-path">
            Installation : <code>{LATCH_INSTALL_PATH}</code>
          </p>
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
          {versionStale && <span className="warn">Version CLI différente du mapping</span>}
          <button type="button" onClick={refreshMapping} disabled={refreshing}>
            {refreshing ? 'Parcours help…' : 'Actualiser le mapping (help)'}
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
          {navPath.length === 0 ? (
            <p className="muted">Choisissez une commande à gauche avec <span className="btn-open inline">Ouvrir</span>.</p>
          ) : (
            <>
              <p className="mono path-line">pass-cli {navPath.join(' ')}</p>
              <p className="muted">{currentNode?.description}</p>
              {currentNode && nodeIsComposable(currentNode) && (
                <button type="button" className="btn-add" onClick={() => addBlock(navPath)}>
                  Ajouter au script
                </button>
              )}
              {currentNode && currentNode.flags.filter((f) => f.name !== '--help').length > 0 && (
                <ul className="flag-hints">
                  {currentNode.flags
                    .filter((f) => f.name !== '--help')
                    .map((f) => (
                      <li key={f.name}>
                        <code>{f.name}</code> — {f.description || (f.positional ? 'argument' : '')}
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <section className="panel composer-band">
        <h2>Compositeur</h2>
        {assistantError && <p className="error pre-wrap">{assistantError}</p>}

        <div className="composer-grid">
          <div>
            <fieldset>
              <legend>Rôle global (--role)</legend>
              {(['viewer', 'editor', 'manager'] as const).map((r) => (
                <label key={r}>
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                  {r}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Format de sortie (--output)</legend>
              <label>
                <input type="radio" name="out" checked={outputFormat === 'json'} onChange={() => setOutputFormat('json')} />
                json
              </label>
              <label>
                <input
                  type="radio"
                  name="out"
                  checked={outputFormat === 'human'}
                  onChange={() => setOutputFormat('human')}
                />
                human
              </label>
            </fieldset>
          </div>

          <div>
            <h3>Familles de listes</h3>
            <p className="muted small">
              Manuel : mémoire jusqu’à la copie. Auto : listage dans votre terminal. Pas d’auto sur{' '}
              <code>item list</code>.
            </p>
            {LIST_FAMILIES.map((fam) => {
              if (!familyHasList(mapping, fam.listPath)) return null
              const cfg = families[fam.key]
              return (
                <div key={fam.key} className="family-row compact">
                  <strong>{fam.label}</strong>
                  <label className="checkbox">
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
                    Boucles <code>{fam.arrayName}</code>
                  </label>
                  <select
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
                    <option value="auto">Auto (terminal)</option>
                  </select>
                  {cfg.mode === 'manual' && (
                    <input
                      className="input"
                      placeholder="Noms séparés par des virgules"
                      value={cfg.manualNames.join(', ')}
                      onChange={(e) => {
                        const parts = e.target.value.split(',').map((s) => s.trim())
                        const rejected = parts.filter((p) => p && userInputUsesSudo(p))
                        if (rejected.length) {
                          setAssistantError(SUDO_REFUSAL_MESSAGE)
                        } else {
                          setAssistantError(null)
                        }
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

          <div>
            <h3>Étapes du script</h3>
            {blocks.length === 0 ? (
              <p className="muted">Ajoutez une commande depuis le menu.</p>
            ) : (
              <ol className="step-list compact">
                {blocks.map((b, i) => (
                  <li key={b.id}>
                    <span>{i + 1}. {commandLabel(b.path)}</span>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => setBlocks((x) => x.filter((y) => y.id !== b.id))}
                    >
                      Retirer
                    </button>
                    <BlockEditor
                      mapping={mapping}
                      block={b}
                      onSudoReject={() => setAssistantError(SUDO_REFUSAL_MESSAGE)}
                      onClearSudo={() => setAssistantError(null)}
                      onChange={(bindings) => {
                        setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, bindings } : x)))
                      }}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <h3>Aperçu bash (temps réel)</h3>
        <p className="muted small">Sélectionnable. Copier envoie exactement ce texte.</p>
        <pre className="script-block selectable">{script}</pre>
        <div className="actions">
          <button type="button" onClick={copyScript}>Copier le script</button>
        </div>
        {copyNotice && (
          <p className="ok" role="status" aria-live="polite">{copyNotice}</p>
        )}
        {runError && <p className="error pre-wrap">{runError}</p>}
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
}: {
  mapping: HelpMappingFile
  block: ComposerBlock
  onChange: (bindings: Record<string, string>) => void
  onSudoReject: () => void
  onClearSudo: () => void
}) {
  const node = getNode(mapping, block.path)
  if (!node) return null
  const fields = node.flags.filter((f) => f.name !== '--help')

  function updateField(name: string, value: string) {
    if (value && userInputUsesSudo(value)) {
      onSudoReject()
      return
    }
    onClearSudo()
    onChange({ ...block.bindings, [name]: value })
  }

  return (
    <div className="param-grid compact">
      {fields.map((f) => (
        <label key={f.name} className="param-row">
          <code>{f.name}</code>
          {f.possibleValues ? (
            <select value={block.bindings[f.name] ?? ''} onChange={(e) => updateField(f.name, e.target.value)}>
              <option value="">—</option>
              {f.possibleValues.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              value={block.bindings[f.name] ?? ''}
              placeholder={f.positional ? 'ex. $AGENT' : 'valeur ou $VAULT'}
              onChange={(e) => updateField(f.name, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  )
}

export default App
