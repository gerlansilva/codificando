import React, { useEffect, useState } from 'react'
import { useData } from '../App.jsx'
import { onSaveStatus, saveData, getProjectPath } from '../data/store.js'
import Icon from './Icon.jsx'

export default function SaveStatus () {
  const { data, saveProjectAs } = useData()
  const [save, setSave] = useState({ state: 'saved', at: null })

  useEffect(() => onSaveStatus((s) => {
    setSave((prev) => {
      if (s.saving) return { state: 'saving', at: prev.at }
      if (s.ok === false) return { state: 'error', at: prev.at }
      if (s.ok === true) return { state: 'saved', at: s.at || Date.now() }
      return prev
    })
  }), [])

  const label = save.state === 'saving'
    ? 'Salvando…'
    : save.state === 'error'
      ? 'Falha ao salvar'
      : (save.at ? `Salvo ${new Date(save.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Salvo')

  return (
    <div className="save-control">
      <span className={'save-dot save-dot--' + save.state} />
      <span className={'save-label save-label--' + save.state}>{label}</span>
      <button className="save-now" title="Salvar projeto agora" onClick={() => { if (getProjectPath()) saveData(data); else saveProjectAs() }}>
        <Icon name="save" size={16} />
        <span>Salvar</span>
      </button>
    </div>
  )
}
