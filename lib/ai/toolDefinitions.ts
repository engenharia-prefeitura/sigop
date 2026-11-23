import type { ChatMode, ToolDefinition, ToolName } from './types';

const idSecao = { type: 'integer', description: 'ID numerico da secao (veja listar_secoes).' };
const idFoto = { type: 'integer', description: 'ID numerico da foto dentro da secao (veja ler_secao).' };

export const READ_ONLY_TOOLS: ToolName[] = ['listar_secoes', 'ler_secao', 'ver_foto'];

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'listar_secoes',
    description:
      'Lista o titulo, a descricao e a data do documento e todas as secoes em ordem (posicao 1-based, id, titulo, tipo, resumo do conteudo e numero de fotos). Use sempre antes de editar para conhecer os IDs.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ler_secao',
    description: 'Le uma secao completa: titulo, tipo, conteudo (HTML simples) e a lista de fotos com id e legenda.',
    parameters: { type: 'object', properties: { id: idSecao }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'criar_secao',
    description:
      "Cria uma nova secao. tipo 'text' (texto) ou 'photos' (galeria de fotos). Por padrao entra no fim; use 'posicao' (numero 1-based, 'inicio' ou 'fim') ou 'apos_secao_id' (tem prioridade). O conteudo aceita apenas HTML simples (b, i, u, br, p, ul, ol, li, strong, em) ou texto puro com quebras de linha.",
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Titulo da secao.' },
        tipo: { type: 'string', enum: ['text', 'photos'], description: "Tipo da secao." },
        conteudo: { type: 'string', description: 'Conteudo inicial (opcional).' },
        posicao: {
          description: "Posicao desejada: numero inteiro 1-based, 'inicio' ou 'fim'.",
          anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', enum: ['inicio', 'fim'] }],
        },
        apos_secao_id: { type: 'integer', description: 'Inserir logo apos esta secao.' },
      },
      required: ['titulo', 'tipo'],
      additionalProperties: false,
    },
  },
  {
    name: 'editar_secao',
    description:
      "Edita o conteudo de uma secao. modo 'substituir' troca todo o conteudo; 'acrescentar' adiciona ao final; 'trocar_trecho' troca um trecho exato (trecho_antigo -> trecho_novo), que deve aparecer uma unica vez no conteudo. Prefira 'trocar_trecho' ou 'acrescentar' para mudancas pequenas.",
    parameters: {
      type: 'object',
      properties: {
        id: idSecao,
        modo: { type: 'string', enum: ['substituir', 'acrescentar', 'trocar_trecho'] },
        conteudo: { type: 'string', description: "Novo conteudo (modos 'substituir' e 'acrescentar')." },
        trecho_antigo: { type: 'string', description: "Trecho existente a trocar (modo 'trocar_trecho')." },
        trecho_novo: { type: 'string', description: "Texto que entra no lugar (modo 'trocar_trecho')." },
      },
      required: ['id', 'modo'],
      additionalProperties: false,
    },
  },
  {
    name: 'renomear_secao',
    description: 'Altera o titulo de uma secao.',
    parameters: {
      type: 'object',
      properties: { id: idSecao, titulo: { type: 'string', description: 'Novo titulo.' } },
      required: ['id', 'titulo'],
      additionalProperties: false,
    },
  },
  {
    name: 'mover_secao',
    description: "Move uma secao para uma nova posicao (numero 1-based, 'inicio' ou 'fim').",
    parameters: {
      type: 'object',
      properties: {
        id: idSecao,
        posicao: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', enum: ['inicio', 'fim'] }] },
      },
      required: ['id', 'posicao'],
      additionalProperties: false,
    },
  },
  {
    name: 'apagar_secao',
    description: 'Apaga uma secao inteira (inclusive suas fotos). Acao destrutiva.',
    parameters: { type: 'object', properties: { id: idSecao }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'editar_metadados',
    description: 'Altera o titulo, a descricao e/ou a data do evento do documento. Informe ao menos um campo.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        data_evento: { type: 'string', description: 'Data no formato AAAA-MM-DD.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'ver_foto',
    description:
      'Devolve a imagem de uma foto que ja esta no documento para voce analisar. Atencao: a imagem no documento esta comprimida (800px); o original so esta disponivel se foi anexado no chat.',
    parameters: {
      type: 'object',
      properties: { secao_id: idSecao, foto_id: idFoto },
      required: ['secao_id', 'foto_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'anexar_fotos_na_secao',
    description:
      "Insere em uma secao do tipo 'photos' fotos que o usuario anexou no chat, com legenda. 'anexo_id' e o id do anexo (ex.: 'foto_1'). A secao deve ser do tipo 'photos'; se nao existir, crie-a antes com criar_secao.",
    parameters: {
      type: 'object',
      properties: {
        secao_id: idSecao,
        fotos: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              anexo_id: { type: 'string', description: "Id do anexo no chat, ex.: 'foto_1'." },
              legenda: { type: 'string', description: 'Legenda da foto.' },
            },
            required: ['anexo_id', 'legenda'],
            additionalProperties: false,
          },
        },
      },
      required: ['secao_id', 'fotos'],
      additionalProperties: false,
    },
  },
  {
    name: 'editar_legenda',
    description: 'Altera a legenda de uma foto de uma secao.',
    parameters: {
      type: 'object',
      properties: { secao_id: idSecao, foto_id: idFoto, legenda: { type: 'string' } },
      required: ['secao_id', 'foto_id', 'legenda'],
      additionalProperties: false,
    },
  },
  {
    name: 'remover_foto',
    description: 'Remove uma foto de uma secao. Acao destrutiva.',
    parameters: {
      type: 'object',
      properties: { secao_id: idSecao, foto_id: idFoto },
      required: ['secao_id', 'foto_id'],
      additionalProperties: false,
    },
  },
];

/** chat_only => so leitura; demais => todas. */
export function getToolsForMode(mode: ChatMode): ToolDefinition[] {
  if (mode === 'chat_only') return TOOL_DEFINITIONS.filter(t => READ_ONLY_TOOLS.includes(t.name as ToolName));
  return TOOL_DEFINITIONS;
}
