import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { FileWatch, FileWatchService, SETTLE_MS } from '../../src/infrastructure/file-watch-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';

/** Against the real filesystem: what matters is how the platform reports an editor's save. */
describe('FileWatchService', () => {
  const service = new FileWatchService();
  let root: string;
  let watch: FileWatch | undefined;

  const file = () => path.join(root, 'apimatic.json');
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Long enough for a platform's events to arrive and settle, with room for a slow runner. */
  const settled = () => pause(SETTLE_MS * 6);

  /** Waits for what is expected rather than for a fixed time, since some platforms deliver events late. */
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline) await pause(25);
  };

  /** As `waitFor`, then a little longer, so a report that should not come has the chance to. */
  const until = async (condition: () => boolean) => {
    await waitFor(condition);
    await settled();
  };

  /**
   * Starts the watch, then gives it time to go live: macOS's FSEvents starts its stream on a
   * thread of its own, and can drop a save made the moment `fs.watch` returns.
   */
  const watchFile = async (
    onChange: () => Promise<void>,
    onFailed: (reason: string) => void = () => undefined,
    directory = root
  ) => {
    watch = service
      .watch(new DirectoryPath(directory), new FileName('apimatic.json'), onChange, onFailed)
      ._unsafeUnwrap();
    await pause(SETTLE_MS * 2);
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-watch-'));
    fs.writeFileSync(file(), '{}');
    // So the event for writing the file in the first place cannot reach a watch started next.
    await settled();
  });

  afterEach(async () => {
    await watch?.close();
    watch = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports a save once it has settled, however many events it arrived as', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
    });

    fs.writeFileSync(file(), '{"a":1}');
    fs.writeFileSync(file(), '{"a":2}');
    fs.appendFileSync(file(), '\n');
    await until(() => calls >= 1);

    expect(calls).to.equal(1);
  });

  // How many editors save: a new file written beside the old, then renamed over it. A watch on
  // the file itself would be left watching the file that was replaced.
  it('keeps reporting after the file is replaced by a rename', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
    });

    for (const [index, contents] of ['{"a":1}', '{"a":2}'].entries()) {
      const temporary = path.join(root, 'apimatic.json.tmp');
      fs.writeFileSync(temporary, contents);
      fs.renameSync(temporary, file());
      await until(() => calls > index);
    }

    expect(calls).to.equal(2);
  });

  it('ignores the other files in the directory', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
    });

    fs.writeFileSync(path.join(root, 'notes.md'), '# notes');
    await settled();

    expect(calls).to.equal(0);
  });

  // A save that lands while the last is still being handled must not be handled beside it:
  // both would read the file and write the preview's files at once.
  it('never reports a save while the last one is still being handled', async () => {
    let active = 0;
    let overlapped = false;
    let calls = 0;
    await watchFile(async () => {
      active += 1;
      overlapped ||= active > 1;
      calls += 1;
      await pause(SETTLE_MS * 4);
      active -= 1;
    });

    fs.writeFileSync(file(), '{"a":1}');
    // Once the first is being handled, so the second lands in the middle of it.
    await waitFor(() => calls >= 1);
    fs.writeFileSync(file(), '{"a":2}');
    await until(() => calls >= 2 && active === 0);

    expect(calls).to.equal(2);
    expect(overlapped).to.be.false;
  });

  // The one handled next reads the file as the last of them left it.
  it('handles the saves made while one is being handled once, however many there were', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
      await pause(SETTLE_MS * 8);
    });

    fs.writeFileSync(file(), '{"a":1}');
    await waitFor(() => calls >= 1);
    for (const contents of ['{"a":2}', '{"a":3}', '{"a":4}']) {
      fs.writeFileSync(file(), contents);
      await pause(SETTLE_MS * 2);
    }
    await until(() => calls >= 2);
    await pause(SETTLE_MS * 8);

    expect(calls).to.equal(2);
  });

  it('keeps reporting after a save whose handling fails', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
      throw new Error('the handler broke');
    });

    fs.writeFileSync(file(), '{"a":1}');
    await waitFor(() => calls >= 1);
    fs.writeFileSync(file(), '{"a":2}');
    await until(() => calls >= 2);

    expect(calls).to.equal(2);
  });

  it('handles the file on request, as though it had just been saved', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
    });

    watch?.recheck();
    await until(() => calls >= 1);

    expect(calls).to.equal(1);
  });

  it('says why when the watch fails once running, and reports nothing after', async () => {
    const watcher = Object.assign(new EventEmitter(), { close: sinon.stub() });
    const fsWatch = sinon.stub(fs, 'watch').returns(watcher as unknown as fs.FSWatcher);
    const failures: string[] = [];
    let calls = 0;
    try {
      await watchFile(
        async () => {
          calls += 1;
        },
        (reason) => failures.push(reason)
      );

      watcher.emit('error', new Error('EPERM: operation not permitted'));
      watch?.recheck();
      await settled();
    } finally {
      fsWatch.restore();
    }

    expect(failures).to.deep.equal(['EPERM: operation not permitted']);
    expect(watcher.close.calledOnce).to.be.true;
    expect(calls).to.equal(0);
  });

  it('reports nothing once closed, not even a save already settling', async () => {
    let calls = 0;
    await watchFile(async () => {
      calls += 1;
    });

    fs.writeFileSync(file(), '{"a":1}');
    await watch?.close();
    await settled();

    expect(calls).to.equal(0);
  });

  it('waits, on closing, for a save it is still handling', async () => {
    let started = false;
    let finished = false;
    await watchFile(async () => {
      started = true;
      await pause(SETTLE_MS * 4);
      finished = true;
    });

    fs.writeFileSync(file(), '{"a":1}');
    await waitFor(() => started);
    await watch?.close();

    expect(started).to.be.true;
    expect(finished).to.be.true;
  });

  // Without the real path this aborts the whole run rather than failing the test.
  it('watches a directory named by its 8.3 short name', async function () {
    // Windows gives the short name only where the volume keeps them, and the long one otherwise.
    const short =
      process.platform === 'win32'
        ? execSync(`for %I in ("${root}") do @echo %~sI`, { encoding: 'utf8' }).trim()
        : root;
    if (short.toLowerCase() === root.toLowerCase()) {
      this.skip();
    }
    let calls = 0;
    await watchFile(
      async () => {
        calls += 1;
      },
      undefined,
      short
    );

    fs.writeFileSync(file(), '{"a":1}');
    await until(() => calls >= 1);

    expect(calls).to.equal(1);
  });

  it('says so when the directory cannot be watched', () => {
    const result = service.watch(
      new DirectoryPath(path.join(root, 'missing')),
      new FileName('apimatic.json'),
      async () => {
        /* never called */
      },
      () => undefined
    );

    expect(result.isErr()).to.be.true;
  });

  // `portal serve` checks the content directory on any save in it, a page or a nav.json alike.
  // Each case runs against the platform's own watch and against the one kept per directory,
  // which Linux gets; the second works on every platform, so it is tested on every one.
  for (const [mode, platform] of [
    ['as this platform watches a tree', process.platform],
    ['one directory at a time', 'linux']
  ] as const) {
    describe(`a whole tree, ${mode}`, () => {
      const deep = () => path.join(root, 'guides', 'deep');
      const nested = () => path.join(deep(), 'page.md');
      let calls: number;

      const watchTree = async () => {
        calls = 0;
        watch = new FileWatchService(platform)
          .watchTree(
            new DirectoryPath(root),
            async () => {
              calls += 1;
            },
            () => undefined,
            (name) => name.startsWith('.')
          )
          ._unsafeUnwrap();
        await pause(SETTLE_MS * 2);
      };

      /** One save, then the count of reports it made once it had settled. */
      const reportsFor = async (save: () => void) => {
        const before = calls;
        save();
        await until(() => calls > before);
        return calls - before;
      };

      beforeEach(async () => {
        fs.mkdirSync(deep(), { recursive: true });
        fs.writeFileSync(nested(), 'first');
        await settled();
      });

      it('reports a save at any depth below the directory, once it has settled', async () => {
        await watchTree();

        const reports = await reportsFor(() => {
          fs.writeFileSync(nested(), 'second');
          fs.appendFileSync(nested(), '\n');
        });

        expect(reports).to.equal(1);
      });

      // What vim, JetBrains' safe write and gedit do, and what Node's own tree watch on Linux
      // stops hearing after the first time.
      it('keeps reporting a file saved again and again by renaming a new one over it', async () => {
        await watchTree();

        for (const round of [1, 2, 3]) {
          const reports = await reportsFor(() => {
            const copy = path.join(deep(), `.page.md.${round}`);
            fs.writeFileSync(copy, `round ${round}`);
            fs.renameSync(copy, nested());
          });
          expect(reports, `save ${round}`).to.equal(1);
        }
      });

      it('reports a save in a directory made after the watch began', async () => {
        await watchTree();
        const fresh = path.join(root, 'fresh', 'deeper');
        await reportsFor(() => fs.mkdirSync(fresh, { recursive: true }));

        const reports = await reportsFor(() => fs.writeFileSync(path.join(fresh, 'page.md'), 'x'));

        expect(reports).to.equal(1);
      });

      it('goes on reporting after a directory in the tree is taken away', async () => {
        await watchTree();
        await reportsFor(() => fs.rmSync(path.join(root, 'guides'), { recursive: true }));
        const settledCalls = calls;
        await settled();

        const reports = await reportsFor(() => fs.writeFileSync(file(), '{"a":1}'));

        expect(calls - settledCalls, 'reports after the removal settled').to.equal(reports);
        expect(reports).to.equal(1);
      });
    });

    // An editor's swap file, or a folder the caller has no use for, would only run its check again.
    // Kept to the top, and apart from the tree above: Windows reports a folder changed when a file
    // in it is, and late enough that a folder made before the watch can still be heard of.
    it(`reports no save of a file, or in a folder, that it is told to ignore, ${mode}`, async () => {
      fs.mkdirSync(path.join(root, '.drafts'));
      await settled();
      let calls = 0;
      watch = new FileWatchService(platform)
        .watchTree(
          new DirectoryPath(root),
          async () => {
            calls += 1;
          },
          () => undefined,
          (name) => name.startsWith('.')
        )
        ._unsafeUnwrap();
      await pause(SETTLE_MS * 2);

      fs.writeFileSync(path.join(root, '.apimatic.json.swp'), 'swap');
      fs.writeFileSync(path.join(root, '.drafts', 'notes.md'), 'draft');
      fs.mkdirSync(path.join(root, '.later', 'deeper'), { recursive: true });
      await settled();
      fs.writeFileSync(path.join(root, '.later', 'deeper', 'notes.md'), 'later');
      await settled();

      expect(calls).to.equal(0);
    });
  }
});
