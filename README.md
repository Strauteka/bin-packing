# bin-packing

3D bin packing for container loading, in TypeScript. It's split the same way as the Java original, [3d-bin-space-utilization](https://github.com/Strauteka/3d-bin-space-utilization), from my master's thesis:

| Package | What it is | Java module |
|---|---|---|
| [@strauteka/space-utilization](packages/space-utilization) | The core: tracks and splits the empty space in a container as boxes are added, so you can write your own algorithm | `core` |
| [@strauteka/bin-packing](packages/bin-packing) | A ready-made randomised packing algorithm built on the core | `demo/algorithm` |

Need a packer? Use `@strauteka/bin-packing`. Building your own strategy? Use `@strauteka/space-utilization`.

## Development

npm workspaces. The core is built first, because `bin-packing` uses its build output.

```sh
npm install
npm run verify # typecheck, test and build both packages
```

## Releasing

Each package is released by its own tag. The `release` workflow checks the version, runs all checks and publishes that package to npm through Trusted Publishing, with provenance.

```sh
npm version patch -w packages/space-utilization   # bumps packages/space-utilization/package.json
git commit -am "Release space-utilization 0.1.1"
git tag space-utilization-v0.1.1
git push --follow-tags
```

Use the `bin-packing-v<version>` tag for `@strauteka/bin-packing`.

## License

Apache-2.0. See [LICENSE](LICENSE).
