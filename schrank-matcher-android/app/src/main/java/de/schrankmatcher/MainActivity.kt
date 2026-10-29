package de.schrankmatcher

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) { App() }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(vm: MainViewModel = viewModel()) {
    var showKeyDialog by remember { mutableStateOf(vm.apiKey.isBlank()) }

    val pickVideo = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.loadVideo(uri)
    }
    val pickInspo = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.loadInspo(uri)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Schrank-Matcher") },
                actions = { TextButton(onClick = { showKeyDialog = true }) { Text("API-Key") } },
            )
        }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            vm.status?.let { Text(it) }
            vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Section("1. Schrank-Video") {
                Text(
                    "Halte jedes Kleidungsstück ca. 1–2 Sekunden offen in die Kamera.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Button(
                    enabled = !vm.busy,
                    onClick = { pickVideo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
                ) { Text("Video auswählen") }
                if (vm.frames.isNotEmpty()) {
                    Text(
                        "${vm.selectedCount} von ${vm.frames.size} Teilen ausgewählt" +
                            if (vm.selectedCount > MainViewModel.MAX_FRAMES) " – max. ${MainViewModel.MAX_FRAMES}, bitte einige abwählen" else "",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Gallery(vm)
                }
            }

            Section("2. Inspo-Bild") {
                Button(
                    enabled = !vm.busy,
                    onClick = { pickInspo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                ) { Text("Inspo-Bild auswählen") }
                vm.inspo?.let {
                    Image(
                        it, contentDescription = "Inspo",
                        modifier = Modifier.heightIn(max = 280.dp).clip(RoundedCornerShape(8.dp)),
                    )
                }
                Button(enabled = vm.canMatch, onClick = { vm.match() }) { Text("Outfit abgleichen") }
            }

            vm.result?.let { result -> ResultSection(vm, result) }
        }
    }

    if (showKeyDialog) {
        ApiKeyDialog(
            current = vm.apiKey,
            onSave = { vm.saveApiKey(it); showKeyDialog = false },
            onDismiss = { showKeyDialog = false },
        )
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
private fun Gallery(vm: MainViewModel) {
    val columns = 3
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        vm.frames.chunked(columns).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { frame ->
                    val off = vm.excluded[frame.nr] == true
                    Box(
                        Modifier
                            .weight(1f)
                            .aspectRatio(3f / 4f)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { vm.toggle(frame.nr) }
                    ) {
                        Image(
                            frame.thumb, contentDescription = "Teil ${frame.nr}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().alpha(if (off) 0.25f else 1f),
                        )
                        Text(
                            "${frame.nr}",
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(4.dp)
                                .background(Color(0x99000000), RoundedCornerShape(4.dp))
                                .padding(horizontal = 5.dp, vertical = 1.dp),
                        )
                    }
                }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun ResultSection(vm: MainViewModel, result: MatchResult) {
    Section("3. Ergebnis") {
        Text(result.outfitBeschreibung)
        if (result.passendeTeile.isEmpty()) Text("Keine passenden Teile gefunden.")
        result.passendeTeile.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                vm.frameFor(item.teilNummer)?.let { frame ->
                    Image(
                        frame.thumb, contentDescription = item.bezeichnung,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.width(110.dp).aspectRatio(3f / 4f).clip(RoundedCornerShape(8.dp)),
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Teil ${item.teilNummer}: ${item.bezeichnung}", fontWeight = FontWeight.SemiBold)
                    Text("Ersetzt im Inspo: ${item.entsprichtImInspo}", style = MaterialTheme.typography.bodySmall)
                    Text("Ähnlichkeit: ${item.aehnlichkeit}", style = MaterialTheme.typography.labelLarge)
                    Text(item.begruendung, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun ApiKeyDialog(current: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var key by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Anthropic API-Key") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Wird nur auf diesem Gerät gespeichert.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = key,
                    onValueChange = { key = it },
                    singleLine = true,
                    placeholder = { Text("sk-ant-…") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSave(key) }) { Text("Speichern") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
    )
}
