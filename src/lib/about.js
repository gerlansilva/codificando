/* Autoria do Codificando — um lugar só, usado na tela inicial, em Configurações e no README. */
export const AUTHOR = {
  name: 'Gerlan Silva da Silva',
  orcid: '0000-0002-9996-9983',
  orcidUrl: 'https://orcid.org/0000-0002-9996-9983',
  repo: 'https://github.com/gerlansilva/codificando'
}

/** Referência sugerida (ABNT) para citar o software em trabalhos acadêmicos. */
export function citation (version = __APP_VERSION__, year = new Date().getFullYear()) {
  return `SILVA, Gerlan Silva da. Codificando: software para análise qualitativa de dados. Versão ${version}. [S. l.], ${year}. Disponível em: ${AUTHOR.repo}.`
}
