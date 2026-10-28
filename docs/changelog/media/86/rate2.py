import socket, sys, time
from concurrent.futures import ThreadPoolExecutor
host, port, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
sa = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)[0][4]
def one(_):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.settimeout(4)
    try:
        s.connect(sa); s.close(); return "ok"
    except (ConnectionResetError, ConnectionRefusedError): return "reset"
    except socket.timeout: return "timeout"
    except OSError: return "reset"
t0 = time.time()
with ThreadPoolExecutor(max_workers=40) as ex:
    r = list(ex.map(one, range(n)))
el = time.time()-t0
print(f"{n} concurrent connect+close in {el:.2f}s ({n/el:.1f}/s offered) -> "
      f"established={r.count('ok')} reset={r.count('reset')} timeout={r.count('timeout')}")
