type Resolvers = {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  };
};

const PromiseConstructor = Promise as unknown as Resolvers;
const native = Object.getOwnPropertyDescriptor(Promise, 'withResolvers');

afterEach(() => {
  if (native) Object.defineProperty(Promise, 'withResolvers', native);
  else delete PromiseConstructor.withResolvers;
});

function install() {
  jest.isolateModules(() => {
    jest.requireActual('../promise');
  });
}

describe('Promise.withResolvers compatibility', () => {
  it('installs settlable resolvers when the runtime lacks them', async () => {
    delete PromiseConstructor.withResolvers;
    install();
    const fulfilled = PromiseConstructor.withResolvers!<string>();
    fulfilled.resolve('done');
    await expect(fulfilled.promise).resolves.toBe('done');
    const rejected = PromiseConstructor.withResolvers!<string>();
    rejected.reject(new Error('failed'));
    await expect(rejected.promise).rejects.toThrow('failed');
  });

  it('keeps an existing implementation', () => {
    const existing = jest.fn();
    Object.defineProperty(Promise, 'withResolvers', {
      configurable: true,
      writable: true,
      value: existing,
    });
    install();
    expect(PromiseConstructor.withResolvers).toBe(existing);
  });
});
