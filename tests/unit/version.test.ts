/**
 * 占位单元测试:验证 VERSION 文件与 package.json 版本一致 (均为 0.2.0)。
 * 同时证明 vitest + NodeNext 类型检查链路可用。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')

interface PackageManifest {
  version: string
}

describe('manifest 一致性', () => {
  it('VERSION 文件与 package.json 的版本一致', () => {
    const versionFile = readFileSync(join(root, 'VERSION'), 'utf8').trim()
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as PackageManifest
    expect(versionFile).toBe(pkg.version)
    expect(pkg.version).toBe('0.2.0')
  })
})
