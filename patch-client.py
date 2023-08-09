#!/usr/bin/env python3

import os
import shutil
import mmap

SCRIPT_SOURCE_FILES = [
	"breeder.js",
	"diggy.js",
	"dungeon-crawler.js",
	"farm-hand.js",
	"gym.js",
	"safari.js",
]

# relative to game's home directory
SCRIPT_INSTALL_DIR = "scripts/syfschydea"

HEADER_PREFIX = "SyfSchydea/pokeclicker-automation:"

# Function to load new scripts in the javascript
SCRIPT_LOADER = """
function loadScript(filename) {
	const script = document.createElement("script");
	script.src = filename;
	document.head.appendChild(script);
}
"""

# Test if the given string exists in the file
def find_in_mmap(file_haystack, str_needle):
	s_bytes = str_needle.encode()
	with mmap.mmap(file_haystack.fileno(), 0, access=mmap.ACCESS_READ) as mm:
		return mm.find(s_bytes) != -1

# Write the given string to the file, but only if the header tag is not found
def write_to_file(f, tag, string):
	full_tag = HEADER_PREFIX + tag
	if find_in_mmap(f, full_tag):
		return

	f.seek(0, 2) # Move to end of file
	f.write(b"\n/* ")
	f.write(full_tag.encode())
	f.write(b" */\n")
	f.write(string.encode())
	f.write(b"\n")

# Write the script loader to the file
def write_script_loader(scripts_file):
	write_to_file(scripts_file, "script-loader", SCRIPT_LOADER)

# Write a call to the script loader to the 
def write_script_import(scripts_file, file_name):
	write_to_file(scripts_file, file_name,
			"loadScript('" + SCRIPT_INSTALL_DIR + "/" + file_name + "');")

def install_script(scripts_file, script_install_dir, file_name):
	print("Installing script", file_name, "...")
	shutil.copyfile(file_name, script_install_dir + "/" + file_name)
	write_script_import(scripts_file, file_name)

if __name__ == "__main__":
	appdata = os.getenv("APPDATA")
	game_scripts_folder = appdata + "/pokeclicker-desktop/pokeclicker-master/docs"
	custom_scripts_folder = game_scripts_folder + "/" + SCRIPT_INSTALL_DIR

	os.makedirs(custom_scripts_folder, exist_ok=True)

	with open(game_scripts_folder + "/scripts/script.min.js", "r+b", 0) as scripts_file:
		write_script_loader(scripts_file)
		
		for script in SCRIPT_SOURCE_FILES:
			install_script(scripts_file, custom_scripts_folder, script)
