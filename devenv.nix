# devenv.nix
# Nix development environment configuration

{
  # Custom scripts available in the dev environment
  scripts = {
    # Shows the current Node.js version and a welcome message with emotes
    welcome.exec = ''
      echo "👋 Welcome to the GitLab Pipeline Trigger Action project!"
      echo "🟢 Current Node.js version: $(node --version 2>/dev/null || echo 'Node.js not found')"
    '';
  };

  enterShell = ''
    welcome
  '';

  # https://devenv.sh/tasks/
  tasks = {
    # Install npm dependencies before the git hook runs
    "npm:install" = {
      exec = "npm install";
      before = [ "devenv:git-hooks:run" ];
    };
  };
}
