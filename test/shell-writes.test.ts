import { describe, expect, it } from 'vitest'
import { writeTargets } from '../src/core/shell-writes.js'

const at = (cmd: string) => writeTargets(cmd, '/work/app')

describe('writes it must catch', () => {
  it('a redirect', () => {
    expect(at('echo x > src/a.ts')).toContain('/work/app/src/a.ts')
    expect(at('echo x >> src/a.ts')).toContain('/work/app/src/a.ts')
  })

  it('a heredoc, which is how an agent usually writes a file', () => {
    expect(at("cat > src/a.ts <<'EOF'\nbody\nEOF")).toContain('/work/app/src/a.ts')
  })

  it('a quoted or absolute path', () => {
    expect(at('echo x > "src/with space.ts"')).toContain('/work/app/src/with space.ts')
    expect(at('echo x > /work/app/src/a.ts')).toContain('/work/app/src/a.ts')
  })

  it('tee', () => {
    expect(at('echo x | tee src/a.ts')).toContain('/work/app/src/a.ts')
    expect(at('echo x | tee -a src/a.ts')).toContain('/work/app/src/a.ts')
  })

  it('in-place sed and perl', () => {
    expect(at("sed -i '' 's/a/b/' src/a.ts")).toContain('/work/app/src/a.ts')
    expect(at("perl -0pi -e 's/a/b/' src/a.ts")).toContain('/work/app/src/a.ts')
  })

  it('cp and mv, by their destination', () => {
    expect(at('cp /tmp/x src/a.ts')).toContain('/work/app/src/a.ts')
    expect(at('mv /tmp/x src/a.ts')).toContain('/work/app/src/a.ts')
  })

  it('an interpreter one-liner that opens a file for writing', () => {
    expect(at(`python3 -c "open('src/a.ts','w').write(s)"`)).toContain('/work/app/src/a.ts')
    expect(at(`node -e "require('fs').writeFileSync('src/a.ts', s)"`)).toContain('/work/app/src/a.ts')
  })

  it('every target in a compound command', () => {
    const found = at('cat > src/a.ts <<EOF\nx\nEOF\nsed -i "" s/a/b/ test/b.ts')
    expect(found).toContain('/work/app/src/a.ts')
    expect(found).toContain('/work/app/test/b.ts')
  })
})

describe('things it must leave alone', () => {
  it('reads', () => {
    expect(at('cat src/a.ts')).toEqual([])
    expect(at('grep -n foo src/a.ts')).toEqual([])
    expect(at('npm test')).toEqual([])
  })

  it('a redirect that lands outside the working tree', () => {
    expect(at('npm test > /tmp/out.txt')).toEqual(['/tmp/out.txt'])
  })

  it('file descriptor redirects, which write nothing', () => {
    expect(at('npm test 2>&1')).toEqual([])
    expect(at('npm test >/dev/null 2>&1')).not.toContain('/work/app/1')
  })

  it('a comparison operator', () => {
    expect(at('[ "$a" -gt 3 ] && echo yes')).toEqual([])
  })

  it('an arrow, which is prose and not a redirect', () => {
    expect(at('echo "SessionStart -> due"')).toEqual([])
    expect(at('echo "a => b"')).toEqual([])
    expect(at('echo "count >= 3"')).toEqual([])
  })

  it('an arrow inside a pattern being searched for', () => {
    // A grep for an arrow function is the commonest read in a TypeScript repo. Gating it
    // teaches nothing and is the fastest way to get the whole gate switched off.
    expect(at('grep -n "() => {" src/foo.ts')).toEqual([])
    expect(at("rg --json 'a -> b' src")).toEqual([])
  })

  it('an angle-bracketed token, which closes a pair rather than opening a redirect', () => {
    // The commit trailer is the one that bites: written through a heredoc, the closing
    // bracket of the address sits before whitespace and a word, so the delimiter itself
    // was read as the file being written.
    const commit = ["git commit -F - <<'EOF'", 'a subject', '', 'Co-Authored-By: A B <a@b.com>', 'EOF'].join('\n')
    expect(at(commit)).toEqual([])
    expect(at('echo "see <https://example.com> for detail"')).toEqual([])
    expect(at('echo "Promise<void> resolves once"')).toEqual([])
  })

  it('a quoted target never runs past its own line', () => {
    // `'[^']+'` with no newline bound swallows everything up to the next quote, which
    // turns one stray `>` into a multi-line blob that still resolves under cwd.
    const cmd = ["X=$(printf '%s' '>')", "echo 'unrelated'"].join('\n')
    for (const target of at(cmd)) expect(target).not.toContain('\n')
  })
})
