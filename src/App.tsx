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
import { commandTextUsesSudo, SUDO_REFUSAL_MESSAGE } from './lib/sudoPolicy'

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

  const script = useMemo(() => {
    try {
      return composeBashScript(mapping, blocks, settings)
    } catch (e) {
      return `# ${e instanceof Error ? e.message : 'Erreur de composition'}`
    }
  }, [mapping, blocks, settings])

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
  }

  function copyScript() {
    setRunError(null)
    setCopyNotice(null)
    if (commandTextUsesSudo(script)) {
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
            'Impossible de copier le script (permission refusée ou contexte non sécurisé). Sélectionnez le bloc ci-dessus manuellement.',
          )
      })
      .catch(() => {
        setRunError(
          'Impossible de copier le script (permission refusée ou contexte non sécurisé). Sélectionnez le bloc ci-dessus manuellement.',
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

      <div className="main-grid">
        <section className="panel">
          <h2>Menu pass-cli</h2>
          <p className="muted">
            <button type="button" className="linkish" disabled={navPath.length === 0} onClick={() => navigateTo([])}>
              Racine
            </button>
            {navPath.map((p, i) => (
              <span key={i}>
                {' / '}
                <button type="button" className="linkish" onClick={() => navigateTo(navPath.slice(0, i + 1))}>
                  {p}
                </button>
              </span>
            ))}
          </p>
          {currentNode && (
            <p className="muted">{currentNode.description}</p>
          )}
          <ul className="menu-list">
            {currentNode?.children.map((child) => {
              const childPath = [...navPath, child.name]
              const childNode = getNode(mapping, childPath)
              const isLeaf = childNode && nodeIsComposable(childNode)
              return (
                <li key={child.name} className="menu-item">
                  <div>
                    <strong>{child.name}</strong>
                    <span className="muted"> — {child.description}</span>
                  </div>
                  <div className="menu-actions">
                    {childNode && childNode.children.length > 0 && (
                      <button type="button" onClick={() => navigateTo(childPath)}>Ouvrir</button>
                    )}
                    {isLeaf && (
                      <button type="button" onClick={() => addBlock(childPath)}>Ajouter au script</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel">
          <h2>Assistant</h2>
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

          <h3>Familles de listes</h3>
          <p className="muted">
            Manuel : noms en mémoire jusqu’à la copie. Auto : le script liste dans votre terminal (Latch ne reçoit
            rien). <code>item list</code> n’est jamais une source auto.
          </p>
          {LIST_FAMILIES.map((fam) => {
            if (!familyHasList(mapping, fam.listPath)) return null
            const cfg = families[fam.key]
            return (
              <div key={fam.key} className="family-row">
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
                    onChange={(e) =>
                      setFamilies((f) => ({
                        ...f,
                        [fam.key]: {
                          ...f[fam.key],
                          manualNames: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      }))
                    }
                  />
                )}
              </div>
            )
          })}

          <h3>Commandes composées</h3>
          {blocks.length === 0 ? (
            <p className="muted">Ajoutez une commande depuis le menu (feuilles de l’aide).</p>
          ) : (
            <ol className="step-list">
              {blocks.map((b, i) => (
                <li key={b.id}>
                  {i + 1}. {commandLabel(b.path)}
                  <button type="button" className="linkish" onClick={() => setBlocks((x) => x.filter((y) => y.id !== b.id))}>
                    Retirer
                  </button>
                  <BlockEditor mapping={mapping} block={b} onChange={(bindings) => {
                    setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, bindings } : x)))
                  }} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Script bash</h2>
        <p className="muted">À copier et exécuter dans votre terminal. Jamais sudo. Latch n’exécute que --version et --help.</p>
        <pre className="script-block">{script}</pre>
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
}: {
  mapping: HelpMappingFile
  block: ComposerBlock
  onChange: (bindings: Record<string, string>) => void
}) {
  const node = getNode(mapping, block.path)
  if (!node) return null
  const fields = node.flags.filter((f) => f.name !== '--help')

  return (
    <div className="param-grid compact">
      {fields.map((f) => (
        <label key={f.name} className="param-row">
          <code>{f.name}</code>
          {f.possibleValues ? (
            <select
              value={block.bindings[f.name] ?? ''}
              onChange={(e) => onChange({ ...block.bindings, [f.name]: e.target.value })}
            >
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
              onChange={(e) => onChange({ ...block.bindings, [f.name]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  )
}

export default App
