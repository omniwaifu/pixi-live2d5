## Cloning the repo

#### Cloning via SSH

Run the following command to clone the repo with submodule:

```sh
git clone --recursive git@github.com:omniwaifu/pixi-live2d5.git
```

#### Cloning via HTTPS

Clone the repository and its submodule over HTTPS:

```sh
git clone --recursive https://github.com/omniwaifu/pixi-live2d5.git
```

#### Initializing the submodule in an existing checkout

If you already cloned the repository without `--recursive`, initialize the pinned submodule with:

```sh
git submodule sync
git submodule update --init
```

## Setup

Install dependencies:

```sh
bun install --ignore-scripts
```

Download Core 6.0.1 and the external shaders from the matching Cubism SDK for Web R5 archive:

```sh
bun run setup
```

Then generate declarations and bundles:

```sh
bun run prepare
```

The install must skip lifecycle scripts on a fresh checkout because `prepare` needs the ignored Core files
created by `bun run setup`.

## Testing

The main validation flow is:

```sh
bun run validate
```

This runs the TypeScript compiler and linter, generates declarations, builds the bundles, and runs both the node and browser tests.

If you only want to run a subset while iterating:

```sh
bun run typecheck
bun run lint
bun run type
bun run typecheck:declarations
bun run build
bun run test:node
bun run test:browser
```

## Playground

The playground is both a debugging surface and a manual smoke test for the public API. To run it:

```sh
bun run playground
```

Changes to `playground/index.ts` should be intentional, because the playground is part of the fork's supported validation path.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request if you have any ideas or suggestions.

Before contributing, or better yet, before each commit, please run the following command:

```sh
bun run validate
```
