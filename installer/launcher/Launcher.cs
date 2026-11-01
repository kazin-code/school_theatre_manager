// School Theatre Manager launcher (C# 5 / .NET Framework 4, built with the csc.exe that ships with Windows).
//
//   SchoolTheatre.exe                     start the app in the background if needed, then open it in the browser
//   SchoolTheatre.exe --no-browser        start it without opening the browser (used at Windows sign-in)
//   SchoolTheatre.exe --stop              stop the background server
//   SchoolTheatre.exe --prepare-logo <image> <folder>   write logo.png (512 px) and logo.ico (256 px) for setup
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Launcher
{
    const string AppName = "School Theatre Manager";
    static readonly string InstallDir = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), AppName);

    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            if (args.Length >= 3 && args[0] == "--prepare-logo") return PrepareLogo(args[1], args[2]);
            if (args.Length >= 1 && args[0] == "--stop") { Stop(); return 0; }
            bool noBrowser = Array.IndexOf(args, "--no-browser") >= 0;

            int port = 8417; bool network = false;
            ReadConfig(ref port, ref network);
            if (!Ping(port))
            {
                StartServer(port, network);
                DateTime until = DateTime.Now.AddSeconds(60);
                while (!Ping(port))
                {
                    if (DateTime.Now > until)
                    {
                        MessageBox.Show(AppName + " didn't start.\r\n\r\nDetails are in " + Path.Combine(DataDir, "logs", "server.log") +
                            "\r\n\r\nIf another program uses port " + port + ", change \"port\" in " + Path.Combine(DataDir, "config.json") + ".",
                            AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return 1;
                    }
                    Thread.Sleep(400);
                }
            }
            if (!noBrowser) Process.Start("http://localhost:" + port + "/");
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show(AppName + " couldn't start:\r\n\r\n" + e.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    static void ReadConfig(ref int port, ref bool network)
    {
        string f = Path.Combine(DataDir, "config.json");
        if (!File.Exists(f)) return;
        string json = File.ReadAllText(f);
        Match m = Regex.Match(json, "\"port\"\\s*:\\s*(\\d+)");
        if (m.Success) { int p; if (int.TryParse(m.Groups[1].Value, out p) && p > 0 && p < 65536) port = p; }
        network = Regex.IsMatch(json, "\"network\"\\s*:\\s*true");
    }

    /** True when our app (not some other program) answers on the port. */
    static bool Ping(int port)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/ping");
            req.Timeout = 1500; req.Proxy = null;
            using (WebResponse res = req.GetResponse())
            using (StreamReader r = new StreamReader(res.GetResponseStream()))
                return r.ReadToEnd().Contains("school-theatre-manager");
        }
        catch { return false; }
    }

    static void StartServer(int port, bool network)
    {
        string app = Path.Combine(InstallDir, "app");
        ProcessStartInfo psi = new ProcessStartInfo(Path.Combine(InstallDir, "node", "node.exe"), "\"" + Path.Combine(app, "start.cjs") + "\"");
        psi.WorkingDirectory = app;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.EnvironmentVariables["NODE_ENV"] = "production";
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["HOSTNAME"] = network ? "0.0.0.0" : "127.0.0.1";
        psi.EnvironmentVariables["STM_DATA_DIR"] = DataDir;
        psi.EnvironmentVariables["STM_MIGRATIONS"] = Path.Combine(app, "drizzle");
        psi.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
        Process.Start(psi);
    }

    static void Stop()
    {
        string pidFile = Path.Combine(DataDir, "server.pid");
        if (!File.Exists(pidFile)) return;
        int pid;
        if (!int.TryParse(File.ReadAllText(pidFile).Trim(), out pid)) return;
        try
        {
            Process p = Process.GetProcessById(pid);
            if (p.ProcessName.Equals("node", StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(5000); }
        }
        catch { }
        try { File.Delete(pidFile); } catch { }
    }

    /** Square, centered copies of the school's logo for the app (PNG) and for Windows shortcuts (ICO). */
    static int PrepareLogo(string src, string folder)
    {
        try
        {
            Directory.CreateDirectory(folder);
            using (Image img = LoadImage(src))
            {
                foreach (string old in new[] { "logo.png", "logo.jpg", "logo.jpeg", "logo.gif", "logo.webp", "logo.ico" })
                    if (File.Exists(Path.Combine(folder, old))) File.Delete(Path.Combine(folder, old));
                using (Bitmap big = Square(img, 512)) big.Save(Path.Combine(folder, "logo.png"), ImageFormat.Png);
                using (Bitmap small = Square(img, 256))
                using (MemoryStream png = new MemoryStream())
                {
                    small.Save(png, ImageFormat.Png);
                    byte[] data = png.ToArray();
                    using (FileStream ico = File.Create(Path.Combine(folder, "logo.ico")))
                    using (BinaryWriter w = new BinaryWriter(ico))
                    {
                        w.Write((short)0); w.Write((short)1); w.Write((short)1);       // ICONDIR: one image
                        w.Write((byte)0); w.Write((byte)0); w.Write((byte)0); w.Write((byte)0); // 256 x 256, no palette
                        w.Write((short)1); w.Write((short)32); w.Write(data.Length); w.Write(22);
                        w.Write(data);
                    }
                }
            }
            return 0;
        }
        catch { return 4; }
    }

    static Image LoadImage(string src)
    {
        if (src.EndsWith(".ico", StringComparison.OrdinalIgnoreCase))
            using (Icon ic = new Icon(src, 256, 256)) return ic.ToBitmap();
        using (FileStream fs = File.OpenRead(src)) return new Bitmap(Image.FromStream(fs));
    }

    static Bitmap Square(Image img, int size)
    {
        Bitmap b = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b))
        {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            double scale = Math.Min((double)size / img.Width, (double)size / img.Height);
            int w = (int)Math.Round(img.Width * scale), h = (int)Math.Round(img.Height * scale);
            g.DrawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        }
        return b;
    }
}
