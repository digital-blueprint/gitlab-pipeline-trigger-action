# devenv.nix
# Nix development environment configuration

{ pkgs, ... }:
{
  languages = {
    javascript.enable = true;
    javascript.npm.enable = true;
    nix.enable = true;
  };

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

  # https://devenv.sh/git-hooks/
  git-hooks.hooks = {
    eslint.enable = true;

    # https://devenv.sh/reference/options/#git-hookshookstreefmt
    # https://github.com/numtide/treefmt
    # https://github.com/numtide/treefmt-nix
    treefmt = {
      enable = true;
      settings.formatters = with pkgs; [
        nodePackages.prettier
        nixfmt-rfc-style
        statix
        taplo
        just
      ];
    };

    # https://devenv.sh/reference/options/#git-hookshooksdeadnix
    # https://github.com/astro/deadnix
    deadnix = {
      enable = true;
      settings = {
        edit = true; # Allow to edit the file if it is not formatted
      };
    };
  };
}
