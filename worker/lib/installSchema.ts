import schemaSql from '../../schema.sql'

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let statement = ''
  let quote: "'" | '"' | '`' | ']' | null = null
  let inLineComment = false
  let inBlockComment = false
  // 追踪 BEGIN...END 块深度（如 trigger 体）：块内的分号不是语句分隔符。
  let beginDepth = 0

  const isWordChar = (c: string | undefined): boolean =>
    c !== undefined && /[A-Za-z0-9_$]/.test(c)

  // 在位置 index 处匹配完整关键字（大小写不敏感，单词边界检查）。
  const matchKeyword = (index: number, word: string): boolean => {
    if (sql.slice(index, index + word.length).toUpperCase() !== word) return false
    return !isWordChar(sql[index - 1]) && !isWordChar(sql[index + word.length])
  }

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const next = sql[index + 1]

    if (inLineComment) {
      if (character === '\n') {
        inLineComment = false
        statement += '\n'
      }
      continue
    }

    if (inBlockComment) {
      if (character === '*' && next === '/') {
        inBlockComment = false
        statement += ' '
        index += 1
      }
      continue
    }

    if (quote) {
      statement += character
      if (character === quote) {
        if (quote !== ']' && next === quote) {
          statement += next
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (character === '-' && next === '-') {
      inLineComment = true
      statement += ' '
      index += 1
      continue
    }
    if (character === '/' && next === '*') {
      inBlockComment = true
      statement += ' '
      index += 1
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
      statement += character
      continue
    }
    if (character === '[') {
      quote = ']'
      statement += character
      continue
    }

    // BEGIN...END 块内的分号不切分。
    if (matchKeyword(index, 'BEGIN')) {
      beginDepth += 1
      statement += sql.slice(index, index + 5)
      index += 4
      continue
    }
    if (matchKeyword(index, 'END')) {
      beginDepth = Math.max(0, beginDepth - 1)
      statement += sql.slice(index, index + 3)
      index += 2
      continue
    }

    if (character === ';') {
      if (beginDepth === 0) {
        const trimmed = statement.trim()
        if (trimmed) statements.push(trimmed)
        statement = ''
      } else {
        statement += character
      }
      continue
    }

    statement += character
  }

  const trimmed = statement.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

export async function initializeSchema(db: D1Database): Promise<void> {
  const statements = splitSqlStatements(schemaSql)
  if (statements.length === 0) throw new Error('installation schema is empty')

  const results = await db.batch(statements.map((statement) => db.prepare(statement)))
  const failed = results.find((result) => !result.success)
  if (failed) throw new Error(failed.error ?? 'installation schema statement failed')
}
