import os
import cgi
import requests

class Utilities:
    """A class for utility functions."""

    @classmethod
    def download_file(cls, url, output_path):
        """Downloads a file.

        Given a URL and an output path, downloads the file 
        from the URL and saves it in the provided path. It 
        also extracts the file name from the headers and
        saves the file with that name.
 
        Args:
            url: The URL of the file to download.
            outpath_path: The path of the folder where to save 
                the file.

        Returns:
            The file name of the downloaded file.
        """
        response = requests.get(url)
        headers = cgi.parse_header(response.headers['content-disposition'])[1]
        file_name = headers['filename']
        cls.create_directories(output_path)
        with open(os.path.join(output_path, file_name), 'wb') as f:
            f.write(response.content)
        return file_name

    @classmethod
    def create_directories(cls, path):
        """Creates directories.

        Checks if a path exists. Creates the required 
        directories if it doesn't.

        Args:
            path: The hierarchical path to check.
        """
        if not os.path.exists(path):
            try:
                os.makedirs(path)
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise