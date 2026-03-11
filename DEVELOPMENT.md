## Cloning the repo

#### Cloning via SSH

Run the following command to clone the repo with submodule:

```sh
git clone git@github.com:omniwaifu/pixi-live2d5.git --recursive
```

#### Cloning via HTTPS

Run the following command to clone the repo _without_ submodule:

```sh
git clone https://github.com/omniwaifu/pixi-live2d5.git
```

Then follow one of the following methods to manually install the submodule:

**Method 1**

```sh
git config --global url."https://github.com/Live2D/CubismWebFramework.git".insteadOf "git@github.com:Live2D/CubismWebFramework.git"

git submodule sync
git submodule update --init
```

**Method 2**

Edit `.gitmodules` and replace `git@github.com:Live2D/CubismWebFramework.git` with `https://github.com/Live2D/CubismWebFramework.git` (don't commit this change if you are contributing to this project!).

Then run:

```sh
git submodule sync
git submodule update --init
```

## Setup

Install dependencies:

```sh
bun install
```

Download the Cubism 5 core files into `./core`:

```sh
bun run setup
```

## Testing

The main validation flow is:

```sh
bun run test
```

This now generates types, builds the bundles, runs the node tests, and runs the browser smoke tests in one command.

If you only want to run a subset while iterating:

```sh
bun run lint
bun run type
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
bun run lint
bun run test
```
