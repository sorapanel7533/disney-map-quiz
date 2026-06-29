$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Users\81701\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $node "$workspace\scripts\owned-site-loop.js" --config "$workspace\config.local.json"
