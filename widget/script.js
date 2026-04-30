define(["jquery"], function ($) {
  return function () {
    const self = this;

    function getServerBaseUrl() {
      const s = (self.get_settings && self.get_settings().server_base_url) || "";
      return String(s || "").trim().replace(/\/+$/, "");
    }

    function renderCustomField() {
      // amoCRM adds:
      // - hidden input: #_custom
      // - container div: #_custom_content
      const $root = $("#_custom_content");
      const $hidden = $("#_custom");
      if (!$root.length || !$hidden.length) return;

      const current = $hidden.val() || "";
      $root.empty();

      const $wrap = $(
        [
          '<div style="padding:12px 0;">',
          '  <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">JSON со схемами процессов</div>',
          '  <textarea id="adaptum_bpmn_processes" style="width:100%;min-height:220px;font-family:monospace;"></textarea>',
          '  <div style="font-size:12px;color:#6b7280;margin-top:6px;">',
          "    Сохраняется в настройках виджета amoCRM. Для больших схем лучше хранить на сервере и тут держать только ID.",
          "  </div>",
          "</div>",
        ].join(""),
      );

      const $ta = $wrap.find("#adaptum_bpmn_processes");
      $ta.val(current);
      $ta.on("input", function () {
        $hidden.val(String($ta.val() || ""));
        $hidden.trigger("change");
      });

      $root.append($wrap);
    }

    return {
      init: function () {
        return true;
      },

      render: function () {
        return true;
      },

      settings: function () {
        renderCustomField();
        return true;
      },

      advancedSettings: function () {
        // This controls the "advanced_settings" page in Settings.
        // We'll mount our hosted UI here (served by our server).
        const baseUrl = getServerBaseUrl();
        const $body = $("body");
        $body.empty();

        if (!baseUrl) {
          $body.append(
            $(
              '<div style="padding:24px;font-family:Arial;">' +
                "<h2>Adaptum BPMN</h2>" +
                "<p>Укажи <b>URL сервера</b> в настройках виджета, чтобы открыть редактор процессов.</p>" +
                "</div>",
            ),
          );
          return true;
        }

        const src = baseUrl + "/widget/processes.html";
        const $frame = $(
          '<iframe style="width:100%;height:calc(100vh - 10px);border:0;" allow="clipboard-read; clipboard-write"></iframe>',
        );
        $frame.attr("src", src);
        $body.append($frame);
        return true;
      },
    };
  };
});

